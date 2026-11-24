import type { SupabaseClient } from '@supabase/supabase-js';
import { isSupabaseConfigured, supabase } from '@/lib/supabase';
import type {
  MarketBridgeResult,
  PassatemposEnqueueResult,
  PassatemposSearchCandidate,
  PassatemposSearchResult,
} from '@/types';

async function getAuthenticatedBridgeClient(
  explicitClient?: SupabaseClient | null,
): Promise<SupabaseClient | null> {
  const online = typeof navigator !== 'undefined' ? navigator.onLine : true;
  if (!online) return null;

  const client =
    explicitClient !== undefined
      ? explicitClient
      : isSupabaseConfigured()
        ? supabase
        : null;

  if (!client) return null;

  try {
    const {
      data: { session },
    } = await client.auth.getSession();
    return session?.access_token ? client : null;
  } catch {
    return null;
  }
}

/**
 * Envia item de mercado para o `Rotinas de Casa` via Edge Function desacoplada `bridge-rotinas`.
 * Degrada graciosamente (`configured: false`) se offline ou sem integração configurada.
 */
export async function sendMarketItemToRotinas(
  itemName: string,
  client?: SupabaseClient | null,
): Promise<MarketBridgeResult> {
  const cleanName = itemName.trim();
  const authClient = await getAuthenticatedBridgeClient(client);
  if (!authClient) {
    return {
      configured: false,
      sent: false,
      item_name: cleanName,
      message: 'Integração com Rotinas de Casa disponível quando conectado na nuvem.',
    };
  }

  try {
    const { data, error } = await authClient.functions.invoke<MarketBridgeResult>(
      'bridge-rotinas',
      { body: { item_name: cleanName } },
    );

    if (error || !data) {
      return {
        configured: false,
        sent: false,
        item_name: cleanName,
        message: 'Não foi possível alcançar a integração com Rotinas de Casa agora.',
      };
    }

    return data;
  } catch {
    return {
      configured: false,
      sent: false,
      item_name: cleanName,
      message: 'Não foi possível alcançar a integração com Rotinas de Casa agora.',
    };
  }
}

/**
 * Consulta candidatos confirmáveis (até 3) no `Passatempos` via Edge Function `bridge-passatempos`.
 */
export async function searchPassatemposCandidates(
  query: string,
  client?: SupabaseClient | null,
): Promise<PassatemposSearchResult> {
  const cleanQuery = query.trim();
  const authClient = await getAuthenticatedBridgeClient(client);
  if (!authClient) {
    return {
      configured: false,
      query: cleanQuery,
      candidates: [],
      message: 'Integração com Passatempos disponível quando conectado na nuvem.',
    };
  }

  try {
    const { data, error } = await authClient.functions.invoke<PassatemposSearchResult>(
      'bridge-passatempos',
      { body: { action: 'search', query: cleanQuery } },
    );

    if (error || !data) {
      return {
        configured: false,
        query: cleanQuery,
        candidates: [],
        message: 'Busca no Passatempos indisponível no momento.',
      };
    }

    return {
      configured: data.configured,
      query: data.query ?? cleanQuery,
      candidates: (data.candidates ?? []).slice(0, 3),
      message: data.message,
    };
  } catch {
    return {
      configured: false,
      query: cleanQuery,
      candidates: [],
      message: 'Busca no Passatempos indisponível no momento.',
    };
  }
}

/**
 * Envia o candidato confirmado pelo usuário para a fila `inbox` do `Passatempos`
 * (nunca sobrescreve `user_data.payload`).
 */
export async function enqueuePassatemposCandidate(
  candidate: PassatemposSearchCandidate,
  client?: SupabaseClient | null,
): Promise<PassatemposEnqueueResult> {
  const authClient = await getAuthenticatedBridgeClient(client);
  if (!authClient) {
    return {
      configured: false,
      queued: false,
      title: candidate.title,
      message: 'Integração com Passatempos não configurada ou sem conexão.',
    };
  }

  try {
    const { data, error } = await authClient.functions.invoke<PassatemposEnqueueResult>(
      'bridge-passatempos',
      { body: { action: 'enqueue', candidate } },
    );

    if (error || !data) {
      return {
        configured: false,
        queued: false,
        title: candidate.title,
        message: 'Não foi possível enviar para a caixa de entrada do Passatempos.',
      };
    }

    return data;
  } catch {
    return {
      configured: false,
      queued: false,
      title: candidate.title,
      message: 'Não foi possível enviar para a caixa de entrada do Passatempos.',
    };
  }
}
