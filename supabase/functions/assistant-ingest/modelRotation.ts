export const GROQ_MODELS = [
  'qwen/qwen3-32b',
  'openai/gpt-oss-120b',
  'openai/gpt-oss-20b',
  'llama-3.3-70b-versatile',
] as const;

export const GEMINI_FALLBACK_MODEL = 'gemini-2.5-flash';

export interface RotationCallParams {
  systemPrompt: string;
  userPrompt: string;
  groqApiKey?: string | null;
  geminiApiKey?: string | null;
  timeoutMs?: number;
  fetchFn?: typeof fetch;
}

export interface RotationModelResult<T = Record<string, unknown>> {
  parsed: T;
  modelUsed: string;
}

const DEFAULT_TIMEOUT_MS = 12_000;

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

export async function callModelWithRotation<T extends Record<string, unknown>>(
  params: RotationCallParams,
): Promise<RotationModelResult<T>> {
  const fetchFn = params.fetchFn ?? fetch;
  const timeoutMs = params.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  const errors: string[] = [];

  if (params.groqApiKey) {
    for (const model of GROQ_MODELS) {
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
  }

  if (params.geminiApiKey) {
    try {
      const endpoint = `https://generativelanguage.googleapis.com/v1beta/models/${GEMINI_FALLBACK_MODEL}:generateContent?key=${encodeURIComponent(params.geminiApiKey)}`;
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
        if (!isRetryableStatus(res.status, errText)) {
          throw new Error(`Erro não recuperável Gemini (${res.status}): ${errText}`);
        }
        errors.push(`${GEMINI_FALLBACK_MODEL}: HTTP ${res.status}`);
      } else {
        const data = (await res.json()) as {
          candidates?: Array<{
            content?: { parts?: Array<{ text?: string }> };
          }>;
        };
        const content = data.candidates?.[0]?.content?.parts?.[0]?.text;
        if (content) {
          const parsed = parseAssistantJsonResponse<T>(content);
          return { parsed, modelUsed: GEMINI_FALLBACK_MODEL };
        }
        errors.push(`${GEMINI_FALLBACK_MODEL}: resposta vazia`);
      }
    } catch (err) {
      if (!isRecoverableError(err)) {
        throw err;
      }
      errors.push(
        `${GEMINI_FALLBACK_MODEL}: ${err instanceof Error ? err.message : 'erro recuperável'}`,
      );
    }
  }

  throw new Error(
    `Todos os modelos falharam na rotação (${errors.join(' | ') || 'nenhuma chave configurada'}).`,
  );
}
