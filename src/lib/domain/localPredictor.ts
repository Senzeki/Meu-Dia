import {
  DEFAULT_TIMEZONE,
  getLocalDateString,
  resolveTimezone,
} from '@/lib/timezone';
import { normalizeTextForSearch } from './textUtils';
import type {
  Asset,
  ClarificationOption,
  ISODateString,
  ISOTimestamp,
} from '@/types';

const URL_REGEX = /https?:\/\/[^\s<>"')]+/i;
const EXPLICIT_METER_REGEX =
  /(?:^|\s)(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)\s*(km|quil[oô]metros?|horas?|hrs?|h)\b/i;
const BARE_NUMBER_REGEX =
  /(?:^|\s)(\d{1,3}(?:\.\d{3})+|\d+(?:[.,]\d+)?)(?=\s|$)/g;

const WAITING_REMINDER_DAYS = 2;

export type LocalPredictionResult =
  | { kind: 'empty' }
  | { kind: 'vault_print'; title: string; body: string | null }
  | { kind: 'vault_link'; title: string; url: string; body: string | null }
  | {
      kind: 'update_asset_meter';
      asset: Asset;
      newMeter: number;
      replyText: string;
    }
  | {
      kind: 'clarify_asset_meter';
      candidates: Asset[];
      newMeter: number;
      question: string;
      options: ClarificationOption[];
    }
  | {
      kind: 'create_task';
      title: string;
      status: 'open' | 'waiting';
      horizon: 'today';
      dueDate: ISODateString;
      waitingRemindAt: ISOTimestamp | null;
      replyText: string;
    };

/**
 * Converte números no formato brasileiro ou internacional (ex: "34.500", "34500", "1.250,5").
 */
export function parseLocalizedNumber(raw: string): number | null {
  const cleaned = raw.trim();
  if (!cleaned) return null;

  let normalized = cleaned;
  if (/^\d{1,3}(\.\d{3})+$/.test(cleaned)) {
    normalized = cleaned.replace(/\./g, '');
  } else if (cleaned.includes(',') && cleaned.includes('.')) {
    normalized = cleaned.replace(/\./g, '').replace(',', '.');
  } else if (cleaned.includes(',')) {
    normalized = cleaned.replace(',', '.');
  }

  const parsed = Number.parseFloat(normalized);
  return Number.isFinite(parsed) ? parsed : null;
}

function extractUrl(text: string): { url: string; remainder: string } | null {
  const match = text.match(URL_REGEX);
  if (!match) return null;
  const rawUrl = match[0].replace(/[.,;!?]+$/, '');
  const remainder = text.replace(match[0], '').replace(/\s+/g, ' ').trim();
  return { url: rawUrl, remainder };
}

function buildLinkTitle(url: string, remainder: string): string {
  if (remainder.length > 0) return remainder;
  try {
    const parsed = new URL(url);
    return parsed.hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

function findMatchingMeterAssets(
  text: string,
  assets: Asset[],
  explicitUnit: 'km' | 'hours' | null,
): Asset[] {
  const normalizedInput = normalizeTextForSearch(text);
  const inputWords = normalizedInput.split(/[^a-z0-9]+/).filter((w) => w.length >= 3);

  const meteredAssets = assets.filter(
    (asset) =>
      !asset.deleted_at &&
      asset.meter_unit !== 'none' &&
      (explicitUnit === null || asset.meter_unit === explicitUnit),
  );

  if (meteredAssets.length === 0) return [];

  const byNameMatch = meteredAssets.filter((asset) => {
    const assetTokens = normalizeTextForSearch(asset.name)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3);
    return assetTokens.some((token) => inputWords.includes(token));
  });

  if (byNameMatch.length > 0) {
    return byNameMatch;
  }

  // Sem menção explícita ao nome do ativo, só casa automaticamente se houver unidade explícita
  return explicitUnit !== null ? meteredAssets : [];
}

function detectDirectMeterUpdate(
  text: string,
  assets: Asset[],
): { newMeter: number; candidates: Asset[] } | null {
  const explicitMatch = text.match(EXPLICIT_METER_REGEX);
  if (explicitMatch) {
    const value = parseLocalizedNumber(explicitMatch[1]);
    if (value === null || value < 0) return null;

    const unitToken = explicitMatch[2].toLowerCase();
    const isSingleHourLetter = unitToken === 'h';
    // Evita confundir horários como "reunião às 15h" com medição de horímetro
    if (isSingleHourLetter && /\b(as|às)\s+\d{1,2}h\b/i.test(text)) {
      return null;
    }

    const explicitUnit: 'km' | 'hours' = unitToken.startsWith('k') ? 'km' : 'hours';
    const candidates = findMatchingMeterAssets(text, assets, explicitUnit);
    if (candidates.length === 0) return null;
    return { newMeter: value, candidates };
  }

  // Padrão sem unidade: ex. "moto 34500"
  const numbers: number[] = [];
  for (const m of text.matchAll(BARE_NUMBER_REGEX)) {
    const parsed = parseLocalizedNumber(m[1]);
    if (parsed !== null && parsed >= 0) {
      numbers.push(parsed);
    }
  }
  if (numbers.length !== 1) return null;

  const candidates = findMatchingMeterAssets(text, assets, null);
  if (candidates.length === 0) return null;
  return { newMeter: numbers[0], candidates };
}

/**
 * Preditor local instantâneo O(1) — funciona 100% offline e sem chamada de IA.
 */
export function predictChatInput(params: {
  text?: string;
  hasImage?: boolean;
  imageTitle?: string;
  assets: Asset[];
  timezone?: string;
  now?: Date;
}): LocalPredictionResult {
  const safeTz = resolveTimezone(params.timezone ?? DEFAULT_TIMEZONE);
  const nowDate = params.now ?? new Date();
  const todayIso = getLocalDateString(nowDate, safeTz);
  const text = (params.text ?? '').trim();

  if (params.hasImage) {
    const title = params.imageTitle?.trim() || text || 'Print salvo em Guardados';
    return {
      kind: 'vault_print',
      title,
      body: text && text !== title ? text : null,
    };
  }

  if (!text) {
    return { kind: 'empty' };
  }

  const extractedUrl = extractUrl(text);
  if (extractedUrl) {
    return {
      kind: 'vault_link',
      title: buildLinkTitle(extractedUrl.url, extractedUrl.remainder),
      url: extractedUrl.url,
      body: extractedUrl.remainder || null,
    };
  }

  const meterDetection = detectDirectMeterUpdate(text, params.assets);
  if (meterDetection) {
    if (meterDetection.candidates.length === 1) {
      const target = meterDetection.candidates[0];
      const unitLabel = target.meter_unit === 'km' ? 'km' : 'h';
      const formatted = meterDetection.newMeter.toLocaleString('pt-BR');
      return {
        kind: 'update_asset_meter',
        asset: target,
        newMeter: meterDetection.newMeter,
        replyText: `Atualizei ${target.name} para ${formatted} ${unitLabel}.`,
      };
    }

    if (meterDetection.candidates.length > 1) {
      const options: ClarificationOption[] = meterDetection.candidates.map((asset) => ({
        id: `asset:${asset.id}`,
        label: asset.name,
        action_patch: {
          kind: 'update_asset_meter',
          asset_id: asset.id,
          meter_value: meterDetection.newMeter,
        },
      }));
      return {
        kind: 'clarify_asset_meter',
        candidates: meterDetection.candidates,
        newMeter: meterDetection.newMeter,
        question: 'Encontrei mais de um ativo compatível. Qual deles você quer atualizar?',
        options,
      };
    }
  }

  const normalized = normalizeTextForSearch(text);
  if (/\baguardando\b/.test(normalized)) {
    const remindAt = new Date(
      nowDate.getTime() + WAITING_REMINDER_DAYS * 86_400_000,
    ).toISOString();
    return {
      kind: 'create_task',
      title: text,
      status: 'waiting',
      horizon: 'today',
      dueDate: todayIso,
      waitingRemindAt: remindAt,
      replyText: `Anotei em Aguardando retorno: "${text}". Lembrete suave em ${WAITING_REMINDER_DAYS} dias.`,
    };
  }

  return {
    kind: 'create_task',
    title: text,
    status: 'open',
    horizon: 'today',
    dueDate: todayIso,
    waitingRemindAt: null,
    replyText: `Adicionei à sua Agenda de hoje: "${text}".`,
  };
}
