export const GROQ_MODELS = [
  'openai/gpt-oss-120b',
  'qwen/qwen3-32b',
  'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile',
] as const;

export const GEMINI_MODELS = [
  'gemini-flash-lite-latest',
  'gemini-2.5-flash',
  'gemini-2.0-flash',
] as const;

export const GEMINI_FALLBACK_MODEL = GEMINI_MODELS[0];

export const WHISPER_MODELS = ['whisper-large-v3-turbo', 'whisper-large-v3'] as const;

export interface RotationCallParams {
  systemPrompt: string;
  userPrompt: string;
  groqApiKey?: string | null;
  geminiApiKey?: string | null;
  preferredGroqModel?: string | null;
  preferredGeminiModel?: string | null;
  preferredProvider?: 'groq' | 'gemini';
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export interface RotationModelResult<T = Record<string, unknown>> {
  parsed: T;
  modelUsed: string;
}

export interface AudioTranscriptionParams {
  audioBytes: Uint8Array;
  audioBase64: string;
  mimeType: string;
  groqApiKey?: string | null;
  geminiApiKey?: string | null;
  preferredWhisperModel?: string | null;
  preferredGeminiModel?: string | null;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

const DEFAULT_TIMEOUT_MS = 12_000;
const AUDIO_TIMEOUT_MS = 15_000;

function uniqueModels(preferred: string | null | undefined, list: readonly string[]): string[] {
  const clean = preferred?.trim();
  if (!clean) return [...list];
  return [clean, ...list.filter((m) => m !== clean)];
}

/**
 * Remove blocos <think>...</think> (ex: Qwen3) e cercas Markdown antes de fazer JSON.parse.
 */
export function extractJsonString(rawText: string): string {
  const withoutThink = rawText.replace(/<think>[\s\S]*?<\/think>/gi, '').trim();
  const fencedMatch = withoutThink.match(/```(?:json)?\s*([\s\S]*?)```/i);
  const candidate = fencedMatch ? fencedMatch[1].trim() : withoutThink;

  const firstBrace = candidate.indexOf('{');
  const lastBrace = candidate.lastIndexOf('}');
  if (firstBrace !== -1 && lastBrace > firstBrace) {
    return candidate.slice(firstBrace, lastBrace + 1);
  }
  return candidate;
}

export function parseAssistantJsonResponse<T extends Record<string, unknown>>(
  rawText: string,
): T {
  const cleaned = extractJsonString(rawText);
  const parsed = JSON.parse(cleaned) as unknown;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error('Resposta JSON do modelo não é um objeto válido.');
  }

  const obj = parsed as Record<string, unknown>;
  if (
    obj.status !== 'applied' &&
    obj.status !== 'needs_clarification'
  ) {
    throw new Error('Campo status ausente ou inválido na resposta do modelo.');
  }
  if (typeof obj.reply_text !== 'string' || !Array.isArray(obj.actions)) {
    throw new Error('Campos reply_text/actions inválidos na resposta do modelo.');
  }

  return obj as T;
}

function isRetryableStatus(status: number, errorBody: string): boolean {
  if (status === 429 || status >= 500 || status === 404) {
    return true;
  }
  if (status === 400 && /model_not_found|model.+not.+found|does not exist/i.test(errorBody)) {
    return true;
  }
  return false;
}

async function fetchWithTimeout(
  fetchFn: typeof fetch,
  url: string,
  init: RequestInit,
  timeoutMs: number,
): Promise<Response> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetchFn(url, { ...init, signal: controller.signal });
  } finally {
    clearTimeout(timer);
  }
}

function isRecoverableError(err: unknown): boolean {
  if (err instanceof Error) {
    if (err.name === 'AbortError') return true;
    if (err instanceof SyntaxError) return true;
    if (
      /JSON|status ausente|Campos reply_text|network|fetch|timeout|aborted/i.test(
        err.message,
      )
    ) {
      return true;
    }
  }
  return false;
}

async function tryGroqModels<T extends Record<string, unknown>>(
  params: RotationCallParams,
  fetchFn: typeof fetch,
  timeoutMs: number,
  errors: string[],
): Promise<RotationModelResult<T> | null> {
  if (!params.groqApiKey) return null;

  const models = uniqueModels(params.preferredGroqModel, GROQ_MODELS);
  for (const model of models) {
    try {
      const res = await fetchWithTimeout(
        fetchFn,
        'https://api.groq.com/openai/v1/chat/completions',
        {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            Authorization: `Bearer ${params.groqApiKey}`,
          },
          body: JSON.stringify({
            model,
            temperature: 0.1,
            response_format: { type: 'json_object' },
            messages: [
              { role: 'system', content: params.systemPrompt },
              { role: 'user', content: params.userPrompt },
            ],
          }),
        },
        timeoutMs,
      );

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        if (isRetryableStatus(res.status, errText)) {
          errors.push(`${model}: HTTP ${res.status}`);
          continue;
        }
        throw new Error(`Erro não recuperável do provedor (${res.status}): ${errText}`);
      }

      const data = (await res.json()) as {
        choices?: Array<{ message?: { content?: string } }>;
      };
      const content = data.choices?.[0]?.message?.content;
      if (!content) {
        errors.push(`${model}: resposta vazia`);
        continue;
      }

      const parsed = parseAssistantJsonResponse<T>(content);
      return { parsed, modelUsed: model };
    } catch (err) {
      if (isRecoverableError(err)) {
        errors.push(`${model}: ${err instanceof Error ? err.message : 'erro recuperável'}`);
        continue;
      }
      throw err;
    }
  }

  return null;
}

async function tryGeminiModels<T extends Record<string, unknown>>(
  params: RotationCallParams,
  fetchFn: typeof fetch,
  timeoutMs: number,
  errors: string[],
): Promise<RotationModelResult<T> | null> {
  if (!params.geminiApiKey) return null;

  const models = uniqueModels(params.preferredGeminiModel, GEMINI_MODELS);
  for (const model of models) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(params.geminiApiKey)}`;
      const res = await fetchWithTimeout(
        fetchFn,
        endpoint,
        {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            systemInstruction: { parts: [{ text: params.systemPrompt }] },
            contents: [{ role: 'user', parts: [{ text: params.userPrompt }] }],
            generationConfig: {
              temperature: 0.1,
              responseMimeType: 'application/json',
            },
          }),
        },
        timeoutMs,
      );

      if (!res.ok) {
        const errText = await res.text().catch(() => '');
        if (isRetryableStatus(res.status, errText)) {
          errors.push(`${model}: HTTP ${res.status}`);
          continue;
        }
        throw new Error(`Erro não recuperável Gemini (${res.status}): ${errText}`);
      }

      const data = (await res.json()) as {
        candidates?: Array<{
          content?: { parts?: Array<{ text?: string }> };
        }>;
      };
      const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
      if (!content) {
        errors.push(`${model}: resposta vazia`);
        continue;
      }

      const parsed = parseAssistantJsonResponse<T>(content);
      return { parsed, modelUsed: model };
    } catch (err) {
      if (isRecoverableError(err)) {
        errors.push(`${model}: ${err instanceof Error ? err.message : 'erro recuperável'}`);
        continue;
      }
      throw err;
    }
  }

  return null;
}

export async function callModelWithRotation<T extends Record<string, unknown>>(
  params: RotationCallParams,
): Promise<RotationModelResult<T>> {
  const fetchFn = params.fetchFn ?? fetch;
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const errors: string[] = [];

  const order: Array<'groq' | 'gemini'> =
    params.preferredProvider === 'gemini' ? ['gemini', 'groq'] : ['groq', 'gemini'];

  for (const provider of order) {
    const result =
      provider === 'groq'
        ? await tryGroqModels<T>(params, fetchFn, timeoutMs, errors)
        : await tryGeminiModels<T>(params, fetchFn, timeoutMs, errors);
    if (result) return result;
  }

  throw new Error(
    `Todos os modelos falharam na rotação (${errors.join(' | ') || 'nenhuma chave configurada'}).`,
  );
}

/**
 * Transcrição de áudio curto em PT-BR com cascata Groq Whisper -> Google Gemini Multimodal.
 * Reaproveita o padrão de higienização de fala do projeto Things, sempre 100% server-side.
 */
export async function transcribeAudioWithRotation(
  params: AudioTranscriptionParams,
): Promise<{ transcript: string; providerUsed: string }> {
  const fetchFn = params.fetchFn ?? fetch;
  const timeoutMs = params.timeoutMs ?? AUDIO_TIMEOUT_MS;
  const errors: string[] = [];

  if (params.groqApiKey) {
    const ext = params.mimeType.includes('mp4')
      ? 'm4a'
      : params.mimeType.includes('ogg')
        ? 'ogg'
        : 'webm';
    const whisperModels = uniqueModels(params.preferredWhisperModel, WHISPER_MODELS);

    for (const model of whisperModels) {
      try {
        const form = new FormData();
        const blob = new Blob([params.audioBytes as unknown as BlobPart], {
          type: params.mimeType,
        });
        form.append('file', blob, `audio.${ext}`);
        form.append('model', model);
        form.append('language', 'pt');
        form.append('response_format', 'json');
        form.append(
          'prompt',
          'Meu Dia, tarefas, agenda, casa, mural, cuidados, moto, km, óleo, garantia, guardados, pausa.',
        );

        const res = await fetchWithTimeout(
          fetchFn,
          'https://api.groq.com/openai/v1/audio/transcriptions',
          {
            method: 'POST',
            headers: {
              Authorization: `Bearer ${params.groqApiKey}`,
            },
            body: form,
          },
          timeoutMs,
        );

        if (res.ok) {
          const data = (await res.json()) as { text?: string };
          const text = data.text?.trim() ?? '';
          if (text) return { transcript: text, providerUsed: model };
          errors.push(`${model}: transcrição vazia`);
          continue;
        }

        const errText = await res.text().catch(() => '');
        if (isRetryableStatus(res.status, errText)) {
          errors.push(`${model}: HTTP ${res.status}`);
          continue;
        }
        // Em 401/403 do Groq, tenta Gemini se disponível antes de abortar
        errors.push(`${model}: HTTP ${res.status}`);
        break;
      } catch (err) {
        errors.push(`${model}: ${err instanceof Error ? err.message : 'erro de rede'}`);
      }
    }
  }

  if (params.geminiApiKey) {
    const cleanBase64 = params.audioBase64.replace(/^data:[^;]+;base64,/, '').trim();
    const geminiModels = uniqueModels(params.preferredGeminiModel, GEMINI_MODELS);

    for (const model of geminiModels) {
      try {
        const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(params.geminiApiKey)}`;
        const res = await fetchWithTimeout(
          fetchFn,
          endpoint,
          {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
              contents: [
                {
                  parts: [
                    {
                      inlineData: {
                        mimeType: params.mimeType || 'audio/webm',
                        data: cleanBase64,
                      },
                    },
                    {
                      text: 'Transcreva exatamente o que foi dito neste áudio em português brasileiro. Elimine repetições mecânicas, gagueiras involuntárias e vícios de linguagem vazios. Retorne EXCLUSIVAMENTE o texto transcrito, sem aspas e sem nenhuma explicação.',
                    },
                  ],
                },
              ],
            }),
          },
          timeoutMs,
        );

        if (res.ok) {
          const data = (await res.json()) as {
            candidates?: Array<{
              content?: { parts?: Array<{ text?: string }> };
            }>;
          };
          const text = data.candidates?.[0]?.content?.parts?.[0]?.text?.trim() ?? '';
          if (text) return { transcript: text, providerUsed: model };
          errors.push(`${model}: transcrição vazia`);
          continue;
        }

        const errText = await res.text().catch(() => '');
        if (isRetryableStatus(res.status, errText)) {
          errors.push(`${model}: HTTP ${res.status}`);
          continue;
        }
        throw new Error(`Falha na transcrição Gemini (${res.status}): ${errText}`);
      } catch (err) {
        if (isRecoverableError(err)) {
          errors.push(`${model}: ${err instanceof Error ? err.message : 'erro recuperável'}`);
          continue;
        }
        throw err;
      }
    }
  }

  throw new Error(
    `Não foi possível transcrever o áudio (${errors.join(' | ') || 'nenhuma chave configurada'}).`,
  );
}
