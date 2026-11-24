import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

interface NotificationJobRow {
  id: string;
  user_id: string;
  household_id: string | null;
  entity_type: string;
  entity_id: string;
  delivery_mode: 'push' | 'call_alarm';
  title: string;
  body: string;
  scheduled_for: string;
  deep_link_message_id: string | null;
}

interface FcmServiceAccount {
  project_id: string;
  client_email: string;
  private_key: string;
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json' },
  });
}

function constantTimeEqual(a: string, b: string): boolean {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i += 1) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

function base64UrlEncode(input: Uint8Array | string): string {
  const bytes =
    typeof input === 'string' ? new TextEncoder().encode(input) : input;
  let binary = '';
  for (let i = 0; i < bytes.length; i += 1) {
    binary += String.fromCharCode(bytes[i]);
  }
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function pemToArrayBuffer(pem: string): ArrayBuffer {
  const b64 = pem
    .replace(/-----BEGIN PRIVATE KEY-----/g, '')
    .replace(/-----END PRIVATE KEY-----/g, '')
    .replace(/\s+/g, '');
  const binary = atob(b64);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes.buffer;
}

async function getFcmAccessToken(sa: FcmServiceAccount): Promise<string> {
  const nowSec = Math.floor(Date.now() / 1000);
  const header = base64UrlEncode(JSON.stringify({ alg: 'RS256', typ: 'JWT' }));
  const claim = base64UrlEncode(
    JSON.stringify({
      iss: sa.client_email,
      scope: 'https://www.googleapis.com/auth/firebase.messaging',
      aud: 'https://oauth2.googleapis.com/token',
      iat: nowSec,
      exp: nowSec + 3600,
    }),
  );

  const signingInput = `${header}.${claim}`;
  const key = await crypto.subtle.importKey(
    'pkcs8',
    pemToArrayBuffer(sa.private_key),
    { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' },
    false,
    ['sign'],
  );
  const signature = await crypto.subtle.sign(
    'RSASSA-PKCS1-v1_5',
    key,
    new TextEncoder().encode(signingInput),
  );
  const jwt = `${signingInput}.${base64UrlEncode(new Uint8Array(signature))}`;

  const tokenRes = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion: jwt,
    }),
  });

  if (!tokenRes.ok) {
    const text = await tokenRes.text().catch(() => '');
    throw new Error(`Falha ao obter token FCM (${tokenRes.status}): ${text}`);
  }

  const data = (await tokenRes.json()) as { access_token?: string };
  if (!data.access_token) {
    throw new Error('OAuth FCM retornou sem access_token.');
  }
  return data.access_token;
}

async function sendFcmPush(params: {
  sa: FcmServiceAccount;
  accessToken: string;
  token: string;
  job: NotificationJobRow;
}): Promise<void> {
  const endpoint = `https://fcm.googleapis.com/v1/projects/${params.sa.project_id}/messages:send`;
  const res = await fetch(endpoint, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${params.accessToken}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      message: {
        token: params.token,
        android: {
          priority: 'HIGH',
        },
        data: {
          job_id: params.job.id,
          entity_type: params.job.entity_type,
          entity_id: params.job.entity_id,
          delivery_mode: params.job.delivery_mode,
          deep_link_message_id: params.job.deep_link_message_id ?? '',
          title: params.job.title,
          body: params.job.body,
        },
      },
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => '');
    throw new Error(`FCM HTTP ${res.status}: ${errText}`);
  }
}

Deno.serve(async (req: Request) => {
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405);
  }

  const cronSecret = Deno.env.get('CRON_SECRET') ?? '';
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const authHeader = req.headers.get('Authorization') ?? '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  const authorized =
    Boolean(token) &&
    ((Boolean(cronSecret) && constantTimeEqual(token, cronSecret)) ||
      (Boolean(serviceRoleKey) && constantTimeEqual(token, serviceRoleKey)));

  if (!authorized) {
    return jsonResponse({ error: 'Não autorizado.' }, 401);
  }

  if (!supabaseUrl || !serviceRoleKey) {
    return jsonResponse({ error: 'Credenciais Supabase ausentes.' }, 500);
  }

  const adminClient = createClient(supabaseUrl, serviceRoleKey);
  const { data: claimed, error: claimError } = await adminClient.rpc(
    'claim_due_notification_jobs',
    { p_batch_size: 25 },
  );

  if (claimError) {
    return jsonResponse({ error: claimError.message }, 500);
  }

  const jobs = (claimed ?? []) as NotificationJobRow[];
  if (jobs.length === 0) {
    return jsonResponse({ claimed: 0, sent: 0, deferred: 0, failed: 0 });
  }

  const fcmJsonRaw = Deno.env.get('FCM_SERVICE_ACCOUNT_JSON') ?? '';
  let fcmAccount: FcmServiceAccount | null = null;
  let fcmAccessToken: string | null = null;

  if (fcmJsonRaw) {
    fcmAccount = JSON.parse(fcmJsonRaw) as FcmServiceAccount;
    fcmAccessToken = await getFcmAccessToken(fcmAccount);
  }

  let sent = 0;
  let deferred = 0;
  let failed = 0;

  for (const job of jobs) {
    try {
      // Respeita active_pause_until apenas para delivery_mode = 'push' (call_alarm sempre dispara)
      if (job.delivery_mode === 'push') {
        const { data: profileRow } = await adminClient
          .from('profiles')
          .select('active_pause_until')
          .eq('id', job.user_id)
          .maybeSingle();

        const pauseUntil = profileRow?.active_pause_until as string | null | undefined;
        if (pauseUntil && Date.parse(pauseUntil) > Date.now()) {
          await adminClient
            .from('notification_jobs')
            .update({
              status: 'pending',
              scheduled_for: pauseUntil,
              locked_at: null,
            })
            .eq('id', job.id);
          deferred += 1;
          continue;
        }
      }

      const { data: tokenRows } = await adminClient
        .from('device_push_tokens')
        .select('token')
        .eq('user_id', job.user_id);

      const tokens = (tokenRows ?? []).map((r) => String(r.token));
      if (!fcmAccount || !fcmAccessToken || tokens.length === 0) {
        await adminClient
          .from('notification_jobs')
          .update({
            status: 'failed',
            last_error:
              tokens.length === 0
                ? 'Nenhum device_push_token cadastrado para o usuário.'
                : 'FCM_SERVICE_ACCOUNT_JSON não configurado.',
          })
          .eq('id', job.id);
        failed += 1;
        continue;
      }

      for (const deviceToken of tokens) {
        await sendFcmPush({
          sa: fcmAccount,
          accessToken: fcmAccessToken,
          token: deviceToken,
          job,
        });
      }

      await adminClient
        .from('notification_jobs')
        .update({
          status: 'sent',
          sent_at: new Date().toISOString(),
          last_error: null,
        })
        .eq('id', job.id);
      sent += 1;
    } catch (err) {
      await adminClient
        .from('notification_jobs')
        .update({
          status: 'failed',
          last_error: err instanceof Error ? err.message : 'Erro desconhecido no envio.',
        })
        .eq('id', job.id);
      failed += 1;
    }
  }

  return jsonResponse({ claimed: jobs.length, sent, deferred, failed });
});
