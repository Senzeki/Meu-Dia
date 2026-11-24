import {
  DEFAULT_TIMEZONE,
  addDaysToIsoDate,
  getLocalDateString,
  getLocalIsoNow,
  getWeekdayFromIsoDate,
  resolveTimezone,
} from '@/lib/timezone';
import { normalizeTextForSearch } from './textUtils';
import type {
  Asset,
  AssistantIngestResponse,
  CareRule,
  ClarificationOption,
  ISODateString,
  ISOTimestamp,
  StructuredAssistantAction,
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

function hasSelfHint(normalized: string): boolean {
  return /\b(minha|meu)\b/.test(normalized);
}

function hasPartnerHint(normalized: string, partnerName?: string | null): boolean {
  if (/\b(dela|dele|esposa|marido|parceira|parceiro)\b/.test(normalized)) {
    return true;
  }
  if (partnerName) {
    const pNorm = normalizeTextForSearch(partnerName);
    if (pNorm.length >= 2 && normalized.includes(pNorm)) {
      return true;
    }
  }
  return false;
}

function findMatchingMeterAssets(
  text: string,
  assets: Asset[],
  explicitUnit: 'km' | 'hours' | null,
  partnerName?: string | null,
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

  // 1) Se há dica de posse ("a minha" vs "a dela" / nome do parceiro)
  const selfHint = hasSelfHint(normalizedInput);
  const partnerHint = hasPartnerHint(normalizedInput, partnerName);

  if (selfHint && !partnerHint) {
    const selfAssets = meteredAssets.filter((a) => {
      const n = normalizeTextForSearch(a.name);
      return /\b(minha|meu)\b/.test(n) || (a.scope === 'personal' && !/\b(esposa|dela|dele)\b/.test(n));
    });
    if (selfAssets.length > 0) {
      // Se também mencionou o nome do ativo (ex: "minha moto"), refina
      const refined = selfAssets.filter((a) =>
        normalizeTextForSearch(a.name)
          .split(/[^a-z0-9]+/)
          .filter((t) => t.length >= 3 && t !== 'minha' && t !== 'meu')
          .some((token) => inputWords.includes(token)),
      );
      return refined.length > 0 ? refined : selfAssets;
    }
  }

  if (partnerHint && !selfHint) {
    const partnerNorm = partnerName ? normalizeTextForSearch(partnerName) : '';
    const partnerAssets = meteredAssets.filter((a) => {
      const n = normalizeTextForSearch(a.name);
      return (
        /\b(esposa|marido|dela|dele|parceira|parceiro)\b/.test(n) ||
        (partnerNorm.length >= 2 && n.includes(partnerNorm))
      );
    });
    if (partnerAssets.length > 0) {
      return partnerAssets;
    }
  }

  // 2) Correspondência por tokens do nome do ativo
  const byNameMatch = meteredAssets.filter((asset) => {
    const assetTokens = normalizeTextForSearch(asset.name)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 3 && t !== 'minha' && t !== 'meu');
    return assetTokens.some((token) => inputWords.includes(token));
  });

  if (byNameMatch.length > 0) {
    return byNameMatch;
  }

  // 3) Sem menção explícita ao nome, só casa automaticamente se houver unidade explícita (km / horas)
  return explicitUnit !== null ? meteredAssets : [];
}

function detectDirectMeterUpdate(
  text: string,
  assets: Asset[],
  partnerName?: string | null,
): { newMeter: number; candidates: Asset[] } | null {
  const explicitMatch = text.match(EXPLICIT_METER_REGEX);
  if (explicitMatch) {
    const value = parseLocalizedNumber(explicitMatch[1]);
    if (value === null || value < 0) return null;

    const unitToken = explicitMatch[2].toLowerCase();
    const isSingleHourLetter = unitToken === 'h';
    if (isSingleHourLetter && /\b(as|às)\s+\d{1,2}h\b/i.test(text)) {
      return null;
    }

    const explicitUnit: 'km' | 'hours' = unitToken.startsWith('k') ? 'km' : 'hours';
    const candidates = findMatchingMeterAssets(text, assets, explicitUnit, partnerName);
    if (candidates.length === 0) return null;
    return { newMeter: value, candidates };
  }

  const numbers: number[] = [];
  for (const m of text.matchAll(BARE_NUMBER_REGEX)) {
    const parsed = parseLocalizedNumber(m[1]);
    if (parsed !== null && parsed >= 0) {
      numbers.push(parsed);
    }
  }
  if (numbers.length !== 1) return null;

  const candidates = findMatchingMeterAssets(text, assets, null, partnerName);
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

function getTimezoneOffsetSuffix(nowDate: Date, timezone: string): string {
  const iso = getLocalIsoNow(nowDate, timezone);
  const match = iso.match(/([+-]\d{2}:\d{2}|Z)$/);
  return match ? match[1] : '-03:00';
}

function computeLocalScheduleTimestamp(
  hour: number,
  minute: number,
  nowDate: Date,
  timezone: string,
): string {
  const safeHour = Math.min(23, Math.max(0, hour));
  const safeMinute = Math.min(59, Math.max(0, minute));
  const todayIso = getLocalDateString(nowDate, timezone);
  const offset = getTimezoneOffsetSuffix(nowDate, timezone);
  const hh = String(safeHour).padStart(2, '0');
  const mm = String(safeMinute).padStart(2, '0');

  let candidate = `${todayIso}T${hh}:${mm}:00${offset}`;
  if (Date.parse(candidate) <= nowDate.getTime()) {
    const tomorrowIso = addDaysToIsoDate(todayIso, 1);
    candidate = `${tomorrowIso}T${hh}:${mm}:00${offset}`;
  }
  return candidate;
}

function parseClockTime(text: string): { hour: number; minute: number } | null {
  const match = text.match(/(?:às|as)?\s*(\d{1,2})\s*(?::|h)\s*(\d{2})?\s*h?\b/i);
  if (!match) return null;
  const hour = Number.parseInt(match[1], 10);
  const minute = match[2] ? Number.parseInt(match[2], 10) : 0;
  if (hour < 0 || hour > 23 || minute < 0 || minute > 59) return null;
  return { hour, minute };
}

function tryParsePauseAction(
  clause: string,
  nowDate: Date,
  timezone: string,
): StructuredAssistantAction | null {
  const norm = normalizeTextForSearch(clause);
  if (!/\b(pausa|desacelerar|descansar|descanso)\b/.test(norm)) {
    return null;
  }

  const daysMatch = norm.match(/\b(\d+)\s*dias?\b/);
  const clock = parseClockTime(clause);
  if (!daysMatch && !clock) {
    return null;
  }

  const daysCount = daysMatch
    ? Math.min(7, Math.max(1, Number.parseInt(daysMatch[1], 10)))
    : 3;
  const startTime = clock
    ? `${String(clock.hour).padStart(2, '0')}:${String(clock.minute).padStart(2, '0')}`
    : '21:30';

  const todayIso = getLocalDateString(nowDate, timezone);
  const startWday = getWeekdayFromIsoDate(todayIso);
  const weekdays: number[] = [];
  for (let i = 0; i < 7 && weekdays.length < daysCount; i += 1) {
    const candidate = (startWday + i) % 7;
    if (!weekdays.includes(candidate)) {
      weekdays.push(candidate);
    }
  }
  weekdays.sort((a, b) => a - b);

  return {
    kind: 'schedule_pause',
    summary: `Configurar ${daysCount} dia(s) de pausa às ${startTime}`,
    confidence: 0.96,
    payload: {
      weekdays,
      start_time: startTime,
      days_count: daysCount,
    },
  };
}

function tryParseMuralAction(
  clause: string,
  nowDate: Date,
  timezone: string,
): StructuredAssistantAction | null {
  const norm = normalizeTextForSearch(clause);
  if (
    !/^(?:avisar|avisa|lembrar|manda(?:r)? recado|recado|mural)\b/.test(norm) &&
    !/\b(?:avisar|recado)\s+(?:a\s+)?(?:esposa|marido|parceira|parceiro)\b/.test(norm)
  ) {
    return null;
  }

  const clock = parseClockTime(clause);
  const notifyAt = clock
    ? computeLocalScheduleTimestamp(clock.hour, clock.minute, nowDate, timezone)
    : null;

  let body = clause
    .replace(/^(?:avisar|avisa|lembrar|mandar recado|manda recado|recado|mural)\s*/i, '')
    .replace(/^(?:para\s+|a\s+)?(?:esposa|marido|parceira|parceiro)\s*/i, '')
    .replace(/(?:às|as)\s*\d{1,2}\s*(?::|h)\s*\d{0,2}\s*h?\s*/i, '')
    .replace(/^[:\-–,\s]+/, '')
    .replace(/^(?:que|para)\s+/i, '')
    .trim();

  if (!body) body = clause.trim();
  body = body.charAt(0).toUpperCase() + body.slice(1);

  return {
    kind: 'create_mural_note',
    summary: `Recado no Mural: "${body}"`,
    confidence: 0.95,
    payload: {
      body,
      notify_at: notifyAt,
      recipient_role: 'partner',
    },
  };
}

function tryParseMarketAction(clause: string): StructuredAssistantAction | null {
  const trimmed = clause.trim();
  const match =
    trimmed.match(/^(?:t[aá]\s+acabando|est[aá]\s+acabando|acabou|faltando|falta)\s+(?:o|a|os|as)?\s*(.+)$/i) ??
    trimmed.match(/^(?:coloca(?:r)?|manda(?:r)?)\s+(?:o|a|os|as)?\s*(.+?)\s+no\s+mercado$/i);

  if (!match) return null;
  const itemName = match[1].replace(/[.!?]+$/, '').trim();
  if (!itemName) return null;

  return {
    kind: 'bridge_market_item',
    summary: `Enviar "${itemName}" para Rotinas de Casa (Mercado)`,
    confidence: 0.94,
    payload: {
      item_name: itemName,
      target_app: 'Rotinas de Casa',
      requires_confirmation: true,
    },
  };
}

function tryDetectFilterOrCareAmbiguity(
  clause: string,
  assets: Asset[],
  careRules: CareRule[],
): ClarificationOption[] | null {
  const norm = normalizeTextForSearch(clause);
  const words = norm.split(/[^a-z0-9]+/).filter((w) => w.length >= 4);
  if (words.length === 0 || words.length > 4) return null;

  const assetMap = new Map(assets.map((a) => [a.id, a]));
  const matchingRules = careRules.filter((rule) => {
    if (rule.deleted_at) return false;
    const ruleNorm = normalizeTextForSearch(rule.title);
    const assetName = assetMap.get(rule.asset_id)?.name ?? '';
    const assetNorm = normalizeTextForSearch(assetName);
    const combined = `${ruleNorm} ${assetNorm}`;
    return words.some((w) => combined.includes(w));
  });

  // Se o texto já identifica exatamente 1 ativo no nome, não é ambíguo
  const mentionedAssets = assets.filter((a) => {
    if (a.deleted_at) return false;
    const tokens = normalizeTextForSearch(a.name)
      .split(/[^a-z0-9]+/)
      .filter((t) => t.length >= 4);
    return tokens.some((t) => words.includes(t));
  });
  if (mentionedAssets.length === 1) return null;

  if (matchingRules.length >= 2) {
    return matchingRules.map((rule) => {
      const assetName = assetMap.get(rule.asset_id)?.name ?? 'Ativo';
      return {
        id: `care:${rule.id}`,
        label: `${rule.title} (${assetName})`,
        action_patch: {
          kind: 'create_task',
          title: `${rule.title} — ${assetName}`,
          horizon: 'today',
          care_rule_id: rule.id,
        },
      };
    });
  }

  return null;
}

function hasDistinctIntentBoundary(fragment: string): boolean {
  const norm = normalizeTextForSearch(fragment);
  return (
    /\b(avisar|avisa|recado|mural|ta acabando|esta acabando|acabou|faltando|pausa|desacelerar|aguardando)\b/.test(
      norm,
    ) ||
    /\d{1,3}(?:\.\d{3})*|\d+\s*(km|h|horas)\b/.test(norm)
  );
}

function splitCompoundClauses(text: string): string[] {
  const primaryParts = text
    .split(/[;\n]+/)
    .map((p) => p.trim())
    .filter(Boolean);

  const result: string[] = [];
  for (const part of primaryParts) {
    // Divide por " e " somente quando o lado direito parece uma intenção independente
    const tokens = part.split(/\s+\be\b\s+/i);
    if (tokens.length === 1) {
      result.push(part);
      continue;
    }

    let current = tokens[0];
    for (let i = 1; i < tokens.length; i += 1) {
      const next = tokens[i];
      if (hasDistinctIntentBoundary(next) || hasDistinctIntentBoundary(current)) {
        // Evita quebrar "comprar pão e leite" quando ambos são só substantivos sem marcador
        const bothIntentful =
          hasDistinctIntentBoundary(next) &&
          (hasDistinctIntentBoundary(current) ||
            /\b(moto|carro|km|horas|avisar|recado|acabando|pausa)\b/i.test(
              normalizeTextForSearch(current),
            ));
        if (bothIntentful || hasDistinctIntentBoundary(next)) {
          result.push(current.trim());
          current = next;
          continue;
        }
      }
      current = `${current} e ${next}`;
    }
    if (current.trim()) {
      result.push(current.trim());
    }
  }

  return result;
}

/**
 * Motor híbrido local (offline/fallback) com suporte a multi-intenção,
 * ambiguidade real (`needs_clarification`), pedidos naturais de pausa, Mural e Mercado.
 */
export function analyzeChatTextLocally(params: {
  text: string;
  assets: Asset[];
  careRules?: CareRule[];
  partnerName?: string | null;
  timezone?: string;
  now?: Date;
}): AssistantIngestResponse {
  const safeTz = resolveTimezone(params.timezone ?? DEFAULT_TIMEZONE);
  const nowDate = params.now ?? new Date();
  const todayIso = getLocalDateString(nowDate, safeTz);
  const text = params.text.trim();

  if (!text) {
    return {
      status: 'applied',
      reply_text: 'Envie uma mensagem para anotar.',
      actions: [],
      model_used: 'local-hybrid-v1',
    };
  }

  const clauses = splitCompoundClauses(text);
  const actions: StructuredAssistantAction[] = [];
  const replyParts: string[] = [];

  for (const clause of clauses) {
    const pauseAction = tryParsePauseAction(clause, nowDate, safeTz);
    if (pauseAction) {
      actions.push(pauseAction);
      replyParts.push(pauseAction.summary);
      continue;
    }

    const muralAction = tryParseMuralAction(clause, nowDate, safeTz);
    if (muralAction) {
      actions.push(muralAction);
      replyParts.push(muralAction.summary);
      continue;
    }

    const marketAction = tryParseMarketAction(clause);
    if (marketAction) {
      actions.push(marketAction);
      replyParts.push(marketAction.summary);
      continue;
    }

    const meterDetection = detectDirectMeterUpdate(
      clause,
      params.assets,
      params.partnerName,
    );
    if (meterDetection) {
      if (meterDetection.candidates.length === 1) {
        const asset = meterDetection.candidates[0];
        const unitLabel = asset.meter_unit === 'km' ? 'km' : 'h';
        actions.push({
          kind: 'update_asset_meter',
          summary: `${asset.name}: ${meterDetection.newMeter.toLocaleString('pt-BR')} ${unitLabel}`,
          confidence: 0.98,
          payload: {
            asset_id: asset.id,
            meter_value: meterDetection.newMeter,
            previous_meter: asset.current_meter,
            previous_meter_updated_at: asset.meter_updated_at,
          },
        });
        replyParts.push(
          `Atualizei ${asset.name} para ${meterDetection.newMeter.toLocaleString('pt-BR')} ${unitLabel}`,
        );
        continue;
      }

      if (meterDetection.candidates.length > 1 && clauses.length === 1) {
        return {
          status: 'needs_clarification',
          reply_text: 'Encontrei mais de um ativo compatível. Qual deles você quer atualizar?',
          actions: [],
          clarification: {
            question: 'Qual ativo você quer atualizar com essa medição?',
            resolved: false,
            selected_option_id: null,
            options: meterDetection.candidates.map((asset) => ({
              id: `asset:${asset.id}`,
              label: asset.name,
              action_patch: {
                kind: 'update_asset_meter',
                asset_id: asset.id,
                meter_value: meterDetection.newMeter,
              },
            })),
          },
          model_used: 'local-hybrid-v1',
        };
      }
    }

    if (clauses.length === 1) {
      const careOptions = tryDetectFilterOrCareAmbiguity(
        clause,
        params.assets,
        params.careRules ?? [],
      );
      if (careOptions) {
        return {
          status: 'needs_clarification',
          reply_text: 'Qual item você quer anotar ou concluir?',
          actions: [],
          clarification: {
            question: `Encontrei mais de uma opção para "${clause}". Qual delas você prefere?`,
            resolved: false,
            selected_option_id: null,
            options: careOptions,
          },
          model_used: 'local-hybrid-v1',
        };
      }
    }

    const norm = normalizeTextForSearch(clause);
    if (/\baguardando\b/.test(norm)) {
      const remindAt = new Date(
        nowDate.getTime() + WAITING_REMINDER_DAYS * 86_400_000,
      ).toISOString();
      actions.push({
        kind: 'create_task',
        summary: `Aguardando retorno: "${clause}"`,
        confidence: 0.95,
        payload: {
          title: clause,
          horizon: 'today',
          status: 'waiting',
          due_date: todayIso,
          waiting_remind_at: remindAt,
        },
      });
      replyParts.push(`Anotei em Aguardando retorno: "${clause}"`);
      continue;
    }

    actions.push({
      kind: 'create_task',
      summary: `Tarefa hoje: "${clause}"`,
      confidence: 0.9,
      payload: {
        title: clause,
        horizon: 'today',
        status: 'open',
        due_date: todayIso,
        waiting_remind_at: null,
      },
    });
    replyParts.push(`Adicionei à Agenda de hoje: "${clause}"`);
  }

  return {
    status: 'applied',
    reply_text:
      replyParts.length > 1
        ? `Organizei ${replyParts.length} itens:\n• ${replyParts.join('\n• ')}`
        : `${replyParts[0] ?? 'Anotado.'}.`,
    actions,
    clarification: null,
    model_used: 'local-hybrid-v1',
  };
}
