import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }
  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405);
  }

  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Autenticação obrigatória.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Configuração Supabase ausente.' }, 500);
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });
  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    return jsonResponse({ error: 'Sessão inválida.' }, 401);
  }

  let body: { item_name?: string };
  try {
    body = (await req.json()) as { item_name?: string };
  } catch {
    return jsonResponse({ error: 'JSON inválido.' }, 400);
  }

  const itemName = (body.item_name ?? '').trim();
  if (!itemName) {
    return jsonResponse({ error: 'Informe item_name.' }, 400);
  }

  const rotinasUrl = Deno.env.get('ROTINAS_SUPABASE_URL') ?? '';
  const rotinasKey = Deno.env.get('ROTINAS_SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const rotinasContaId = Deno.env.get('ROTINAS_CONTA_ID') ?? '';
  if (!rotinasUrl || !rotinasKey) {
    return jsonResponse({
      configured: false,
      sent: false,
      item_name: itemName,
      message: 'Integração opcional com Rotinas de Casa não configurada neste servidor.',
    });
  }

  const rotinasClient = createClient(rotinasUrl, rotinasKey);
  const nowIso = new Date().toISOString();

  let targetContaId = rotinasContaId;
  if (!targetContaId) {
    const { data: contaRow } = await rotinasClient
      .from('produtos_armario')
      .select('conta_id')
      .limit(1)
      .maybeSingle();
    targetContaId = (contaRow?.conta_id as string | undefined) ?? user.id;
  }

  let existingQuery = rotinasClient
    .from('produtos_armario')
    .select('id')
    .ilike('nome', itemName)
    .limit(1);

  if (targetContaId) {
    existingQuery = existingQuery.eq('conta_id', targetContaId);
  }

  const { data: existing } = await existingQuery.maybeSingle();

  if (existing?.id) {
    const { error } = await rotinasClient
      .from('produtos_armario')
      .update({
        status: 'falta',
        na_lista_mercado: true,
        canal_preferencial: 'mercado',
        atualizado_em: nowIso,
      })
      .eq('id', existing.id);

    if (error) {
      return jsonResponse({ error: error.message }, 502);
    }
  } else {
    const { error } = await rotinasClient.from('produtos_armario').insert({
      conta_id: targetContaId,
      nome: itemName,
      categoria: 'Outros',
      status: 'falta',
      na_lista_mercado: true,
      canal_preferencial: 'mercado',
      atualizado_em: nowIso,
    });

    if (error) {
      return jsonResponse({ error: error.message }, 502);
    }
  }

  return jsonResponse({
    configured: true,
    sent: true,
    item_name: itemName,
    message: `"${itemName}" enviado para a lista de mercado do Rotinas de Casa.`,
  });
});
