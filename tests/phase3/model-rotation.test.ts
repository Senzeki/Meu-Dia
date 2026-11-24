import { describe, expect, it, vi } from 'vitest';
import {
  GEMINI_FALLBACK_MODEL,
  GROQ_MODELS,
  callModelWithRotation,
} from '../../supabase/functions/assistant-ingest/modelRotation';

describe('Rotação de Modelos e Fallback na Edge Function (Fase 3)', () => {
  it('faz fallback sequencial em HTTP 429, 500, 404, AbortError (timeout) e JSON inválido até Gemini', async () => {
    const calledModels: string[] = [];

    const mockFetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const urlStr = String(url);
      if (urlStr.includes('groq.com')) {
        const body = JSON.parse(String(init?.body ?? '{}')) as { model: string };
        calledModels.push(body.model);

        if (body.model === GROQ_MODELS[0]) {
          return new Response('rate limited', { status: 429 });
        }
        if (body.model === GROQ_MODELS[1]) {
          return new Response('upstream error', { status: 502 });
        }
        if (body.model === GROQ_MODELS[2]) {
          return new Response('model_not_found', { status: 404 });
        }
        if (body.model === GROQ_MODELS[3]) {
          const abortErr = new Error('The operation was aborted');
          abortErr.name = 'AbortError';
          throw abortErr;
        }
      }

      if (urlStr.includes('generativelanguage.googleapis.com')) {
        calledModels.push(GEMINI_FALLBACK_MODEL);
        return new Response(
          JSON.stringify({
            candidates: [
              {
                content: {
                  parts: [
                    {
                      text: JSON.stringify({
                        status: 'applied',
                        reply_text: 'Anotado via Gemini fallback.',
                        actions: [
                          {
                            kind: 'create_task',
                            summary: 'Comprar óleo',
                            confidence: 0.95,
                            payload: { title: 'Comprar óleo', horizon: 'today' },
                          },
                        ],
                      }),
                    },
                  ],
                },
              },
            ],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }

      throw new Error(`URL inesperada: ${urlStr}`);
    }) as unknown as typeof fetch;

    const res = await callModelWithRotation({
      systemPrompt: 'sys',
      userPrompt: 'comprar óleo',
      groqApiKey: 'test-groq-key',
      geminiApiKey: 'test-gemini-key',
      fetchFn: mockFetch,
    });

    expect(res.modelUsed).toBe(GEMINI_FALLBACK_MODEL);
    expect(res.parsed.status).toBe('applied');
    expect(calledModels).toEqual([...GROQ_MODELS, GEMINI_FALLBACK_MODEL]);
  });

  it('faz fallback quando modelo retorna JSON inválido ou bloco <think> malformado', async () => {
    const calledModels: string[] = [];

    const mockFetch = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      const body = JSON.parse(String(init?.body ?? '{}')) as { model: string };
      calledModels.push(body.model);

      if (body.model === GROQ_MODELS[0]) {
        return new Response(
          JSON.stringify({
            choices: [{ message: { content: 'texto solto sem json valido' } }],
          }),
          { status: 200 },
        );
      }

      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content:
                  '<think>raciocinio interno</think>```json\n{"status":"applied","reply_text":"Feito","actions":[]}\n```',
              },
            },
          ],
        }),
        { status: 200 },
      );
    }) as unknown as typeof fetch;

    const res = await callModelWithRotation({
      systemPrompt: 'sys',
      userPrompt: 'oi',
      groqApiKey: 'test-groq-key',
      fetchFn: mockFetch,
    });

    expect(calledModels).toEqual([GROQ_MODELS[0], GROQ_MODELS[1]]);
    expect(res.modelUsed).toBe(GROQ_MODELS[1]);
    expect(res.parsed.reply_text).toBe('Feito');
  });

  it('lança erro imediato sem tentar outros modelos em HTTP 401/403 não recuperáveis', async () => {
    const mockFetch = vi.fn(async () => new Response('unauthorized', { status: 401 })) as unknown as typeof fetch;

    await expect(
      callModelWithRotation({
        systemPrompt: 'sys',
        userPrompt: 'teste',
        groqApiKey: 'bad-key',
        geminiApiKey: 'gem-key',
        fetchFn: mockFetch,
      }),
    ).rejects.toThrow(/401/);

    expect(mockFetch).toHaveBeenCalledTimes(1);
  });
});
