import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.49.1';
import { callModelWithRotation } from './modelRotation.ts';

const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
};

const MAX_AUDIO_DURATION_SECONDS = 90;
const MAX_AUDIO_BYTES = 4 * 1024 * 1024;
const WHISPER_MODELS = ['whisper-large-v3-turbo', 'whisper-large-v3'] as const;

interface IngestBody {
  message_id?: string;
  text?: string;
  audio_base64?: string;
  audio_mime_type?: string;
  audio_duration_seconds?: number;
  media_path?: string | null;
  local_iso_now?: string;
  timezone?: string;
  context?: {
    assets?: Array<{
      id: string;
      name: string;
      category: string;
      meter_unit: 'km' | 'hours' | 'none';
      current_meter: number | null;
    }>;
    partner_name?: string | null;
  };
}

function jsonResponse(body: Record<string, unknown>, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json' },
  });
}

function decodeBase64ToBytes(base64: string): Uint8Array {
  const clean = base64.replace(/^data:[^;]+;base64,/, '').trim();
  const binary = atob(clean);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i += 1) {
    bytes[i] = binary.charCodeAt(i);
  }
  return bytes;
}

async function transcribeAudioWithGroq(params: {
  audioBytes: Uint8Array;
  mimeType: string;
  groqApiKey: string;
}): Promise<string> {
  const ext = params.mimeType.includes('mp4')
    ? 'm4a'
    : params.mimeType.includes('ogg')
      ? 'ogg'
      : 'webm';

  for (const model of WHISPER_MODELS) {
    const form = new FormData();
    const blob = new Blob([params.audioBytes], { type: params.mimeType });
    form.append('file', blob, `audio.${ext}`);
    form.append('model', model);
    form.append('language', 'pt');
    form.append('response_format', 'json');

    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), 15_000);
    try {
      const res = await fetch('https://api.groq.com/openai/v1/audio/transcriptions', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${params.groqApiKey}`,
        },
        body: form,
        signal: controller.signal,
      });

      if (res.ok) {
        const data = (await res.json()) as { text?: string };
        const text = data.text?.trim() ?? '';
        if (text) return text;
      }

      if (res.status === 429 || res.status >= 500 || res.status === 404) {
        continue;
      }
      const errText = await res.text().catch(() => '');
      throw new Error(`Falha na transcrição (${res.status}): ${errText}`);
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error('Não foi possível transcrever o áudio no momento.');
}

function buildSystemPrompt(params: {
  localIsoNow: string;
  timezone: string;
  assets: NonNullable<IngestBody['context']>['assets'];
  partnerName?: string | null;
}): string {
  const assetList = (params.assets ?? [])
    .map(
      (a) =>
        `- id=${a.id} | nome="${a.name}" | categoria=${a.category} | unidade=${a.meter_unit} | atual=${a.current_meter ?? 'n/d'}`,
    )
    .join('\n');

  return `Você é o assistente do aplicativo pessoal e familiar "Meu Dia" (português brasileiro natural, direto e calmo).
Data/hora local atual do usuário: ${params.localIsoNow} (fuso: ${params.timezone}).
Nome do(a) parceiro(a): ${params.partnerName || 'Esposa / Parceiro(a)'}.
Ativos cadastrados do usuário:
${assetList || '(nenhum ativo cadastrado)'}

Responda EXCLUSIVAMENTE com JSON válido no formato:
{
  "status": "applied" | "needs_clarification",
  "reply_text": "resposta curta em PT-BR",
  "actions": [
    {
      "kind": "create_task" | "update_asset_meter" | "create_mural_note" | "create_vault_item" | "schedule_pause" | "bridge_market_item" | "bridge_passatempos_search",
      "summary": "resumo curto",
      "confidence": 0.0 a 1.0,
      "payload": { ... }
    }
  ],
  "clarification": null | {
    "question": "pergunta clara",
    "resolved": false,
    "options": [
      { "id": "opt-1", "label": "rotulo curto", "action_patch": { ... } }
    ]
  }
}

Regras críticas:
1. Multi-intenção: se a frase tiver múltiplas ações (ex: atualizar km + recado no Mural + item de mercado), emita todas em actions[].
2. Ambiguidade: se houver >= 2 ativos possíveis e o usuário não diferenciou (ex: "moto 34.500" com duas motos), NÃO chute! Retorne status="needs_clarification", actions=[], e preencha clarification.options com action_patch contendo { "kind": "update_asset_meter", "asset_id": "...", "meter_value": 34500 }.
3. Pausas naturais: para pedidos como "quero 4 dias de pausa essa semana às 21h", use kind="schedule_pause" com payload { "weekdays": [1,2,4,6], "start_time": "21:00", "days_count": 4 }.
4. Mural: para recados ao parceiro ("avisar esposa às 15:00: ..."), use kind="create_mural_note" com payload { "body": "...", "notify_at": "ISO-8601 com offset do timezone", "recipient_role": "partner" }.
5. Mercado: para avisos como "tá acabando o arroz", use kind="bridge_market_item" com payload { "item_name": "arroz", "target_app": "Rotinas de Casa" }.
6. Nunca invente jargões artificiais.`;
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: CORS_HEADERS });
  }

  if (req.method !== 'POST') {
    return jsonResponse({ error: 'Método não permitido.' }, 405);
  }

  // Autenticação obrigatória via JWT do Supabase Auth
  const authHeader = req.headers.get('Authorization');
  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    return jsonResponse({ error: 'Autenticação obrigatória.' }, 401);
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY') ?? '';
  if (!supabaseUrl || !supabaseAnonKey) {
    return jsonResponse({ error: 'Configuração Supabase ausente no servidor.' }, 500);
  }

  const authClient = createClient(supabaseUrl, supabaseAnonKey, {
    global: { headers: { Authorization: authHeader } },
  });

  const {
    data: { user },
    error: authError,
  } = await authClient.auth.getUser();

  if (authError || !user) {
    return jsonResponse({ error: 'Sessão inválida ou expirada.' }, 401);
  }

  let body: IngestBody;
  try {
    body = (await req.json()) as IngestBody;
  } catch {
    return jsonResponse({ error: 'Corpo JSON inválido.' }, 400);
  }

  if (
    typeof body.audio_duration_seconds === 'number' &&
    body.audio_duration_seconds > MAX_AUDIO_DURATION_SECONDS
  ) {
    return jsonResponse(
      { error: `Áudio excede o limite de ${MAX_AUDIO_DURATION_SECONDS} segundos.` },
      400,
    );
  }

  const groqApiKey = Deno.env.get('GROQ_API_KEY') ?? '';
  const geminiApiKey = Deno.env.get('GEMINI_API_KEY') ?? '';
  if (!groqApiKey && !geminiApiKey) {
    return jsonResponse({ error: 'Chaves de IA não configuradas no servidor.' }, 500);
  }

  let effectiveText = (body.text ?? '').trim();
  let transcript: string | undefined;

  if (body.audio_base64) {
    if (!groqApiKey) {
      return jsonResponse({ error: 'Transcrição requer GROQ_API_KEY no servidor.' }, 500);
    }

    let audioBytes: Uint8Array | null = decodeBase64ToBytes(body.audio_base64);
    if (audioBytes.byteLength > MAX_AUDIO_BYTES) {
      audioBytes = null;
      return jsonResponse({ error: 'Arquivo de áudio excede o limite de 4 MB.' }, 413);
    }

    try {
      transcript = await transcribeAudioWithGroq({
        audioBytes,
        mimeType: body.audio_mime_type || 'audio/webm',
        groqApiKey,
      });
      effectiveText = transcript;
    } finally {
      // Descarta referência ao buffer de áudio imediatamente após transcrição
      audioBytes = null;
      body.audio_base64 = undefined;
    }
  }

  if (!effectiveText) {
    return jsonResponse({ error: 'Informe texto ou áudio para processar.' }, 400);
  }

  const timezone = body.timezone?.trim() || 'America/Sao_Paulo';
  const localIsoNow = body.local_iso_now?.trim() || new Date().toISOString();
  const systemPrompt = buildSystemPrompt({
    localIsoNow,
    timezone,
    assets: body.context?.assets,
    partnerName: body.context?.partner_name,
  });

  try {
    const { parsed, modelUsed } = await callModelWithRotation({
      systemPrompt,
      userPrompt: effectiveText,
      groqApiKey,
      geminiApiKey,
    });

    return jsonResponse({
      ...parsed,
      ...(transcript ? { transcript } : {}),
      model_used: modelUsed,
    });
  } catch (err) {
    return jsonResponse(
      { error: err instanceof Error ? err.message : 'Falha ao processar mensagem.' },
      502,
    );
  }
});
