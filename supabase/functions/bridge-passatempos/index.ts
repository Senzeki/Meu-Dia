import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

interface CandidatePayload {
  external_id: string;
  title: string;
  kind: string;
  year?: string | number | null;
  subtitle?: string | null;
  poster_url?: string | null;
}

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

  let body: {
    action?: 'search' | 'enqueue';
    query?: string;
    candidate?: CandidatePayload;
  };
  try {
    body = (await req.json()) as typeof body;
  } catch {
    return jsonResponse({ error: 'JSON inválido.' }, 400);
  }

  if (body.action === 'search') {
    const query = (body.query ?? '').trim();
    if (!query) {
      return jsonResponse({ error: 'Informe query para busca.' }, 400);
    }

    const apiUrl = (Deno.env.get('PASSATEMPOS_API_URL') ?? '').replace(/\/$/, '');
    const bridgeToken = Deno.env.get('PASSATEMPOS_BRIDGE_TOKEN') ?? '';
    if (!apiUrl) {
      return jsonResponse({
        configured: false,
        query,
        candidates: [],
        message: 'Integração opcional com Passatempos não configurada neste servidor.',
      });
    }

    const headers: Record<string, string> = {};
    if (bridgeToken) {
      headers.Authorization = `Bearer ${bridgeToken}`;
    }

    const res = await fetch(`${apiUrl}/search?q=${encodeURIComponent(query)}`, {
      method: 'GET',
      headers,
    });
    if (!res.ok) {
      return jsonResponse({ error: `Passatempos /search HTTP ${res.status}` }, 502);
    }

    const raw = (await res.json()) as
      | CandidatePayload[]
      | { results?: CandidatePayload[]; items?: CandidatePayload[] };
    const list = Array.isArray(raw)
      ? raw
      : (raw.results ?? raw.items ?? []);

    return jsonResponse({
      configured: true,
      query,
      candidates: list.slice(0, 3),
    });
  }

  if (body.action === 'enqueue') {
    const candidate = body.candidate;
    if (!candidate?.external_id || !candidate.title) {
      return jsonResponse({ error: 'Candidato inválido para envio.' }, 400);
    }

    const passUrl = Deno.env.get('PASSATEMPOS_SUPABASE_URL') ?? '';
    const passKey = Deno.env.get('PASSATEMPOS_SUPABASE_SERVICE_ROLE_KEY') ?? '';
    if (!passUrl || !passKey) {
      return jsonResponse({
        configured: false,
        queued: false,
        title: candidate.title,
        message: 'Integração opcional com Passatempos não configurada neste servidor.',
      });
    }

    // Grava exclusivamente na fila `public.inbox` (NUNCA sobrescreve `user_data.payload`)
    const passClient = createClient(passUrl, passKey);
    const { error } = await passClient.from('inbox').insert({
      source: 'meu-dia',
      requested_by_user_id: user.id,
      external_id: candidate.external_id,
      title: candidate.title,
      kind: candidate.kind,
      year: candidate.year ?? null,
      poster_url: candidate.poster_url ?? null,
      status: 'pending',
      created_at: new Date().toISOString(),
    });

    if (error) {
      return jsonResponse({ error: error.message }, 502);
    }

    return jsonResponse({
      configured: true,
      queued: true,
      title: candidate.title,
      message: `"${candidate.title}" enviado para a caixa de entrada do Passatempos.`,
    });
  }

  return jsonResponse({ error: 'Ação inválida (use search ou enqueue).' }, 400);
});
