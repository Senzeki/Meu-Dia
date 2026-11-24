import {
  DEFAULT_TIMEZONE,
  diffDaysBetweenIsoDates,
  getLocalDateString,
  resolveTimezone,
} from '@/lib/timezone';
import type {
  Asset,
  ChatMessage,
  ISOTimestamp,
  LinkedEntityRef,
} from '@/types';

export const WEEKLY_CHECKIN_INTERVAL_DAYS = 7;

export interface EvaluateWeeklyCheckinParams {
  assets: Asset[];
  messages: ChatMessage[];
  activePauseUntil?: ISOTimestamp | null;
  pauseActive?: boolean;
  timezone?: string;
  now?: Date;
}

export interface WeeklyCheckinProposal {
  body: string;
  linkedEntities: LinkedEntityRef[];
}

/**
 * Avalia em `America/Sao_Paulo` se há ativos com medidor sem atualização há >= 7 dias,
 * respeitando pausas ativas e evitando duplicação na mesma semana.
 */
export function evaluateWeeklyCheckin(
  params: EvaluateWeeklyCheckinParams,
): WeeklyCheckinProposal | null {
  const nowDate = params.now ?? new Date();
  const safeTz = resolveTimezone(params.timezone ?? DEFAULT_TIMEZONE);

  if (params.pauseActive) {
    return null;
  }
  if (params.activePauseUntil) {
    const pauseUntilMs = Date.parse(params.activePauseUntil);
    if (!Number.isNaN(pauseUntilMs) && pauseUntilMs > nowDate.getTime()) {
      return null;
    }
  }

  const todayIso = getLocalDateString(nowDate, safeTz);

  // Evita duplicar check-in dentro da janela de 7 dias no fuso do perfil
  const recentCheckin = params.messages
    .filter((m) => m.message_type === 'checkin' && !m.deleted_at)
    .sort((a, b) => b.created_at.localeCompare(a.created_at))[0];

  if (recentCheckin) {
    const lastCheckinDate = getLocalDateString(
      new Date(recentCheckin.created_at),
      safeTz,
    );
    if (diffDaysBetweenIsoDates(lastCheckinDate, todayIso) < WEEKLY_CHECKIN_INTERVAL_DAYS) {
      return null;
    }
  }

  const staleAssets = params.assets.filter((asset) => {
    if (asset.deleted_at || asset.meter_unit === 'none') return false;
    const refTimestamp = asset.meter_updated_at ?? asset.created_at;
    const refDate = getLocalDateString(new Date(refTimestamp), safeTz);
    return diffDaysBetweenIsoDates(refDate, todayIso) >= WEEKLY_CHECKIN_INTERVAL_DAYS;
  });

  if (staleAssets.length === 0) {
    return null;
  }

  let body: string;
  if (staleAssets.length === 1) {
    const asset = staleAssets[0];
    const unitLabel = asset.meter_unit === 'km' ? 'km' : 'horas';
    const currentHint =
      asset.current_meter !== null
        ? ` (última leitura: ${asset.current_meter.toLocaleString('pt-BR')} ${unitLabel})`
        : '';
    body = `Passou uma semana desde a última leitura de ${asset.name}${currentHint}. Quer atualizar por aqui quantos ${unitLabel} está marcando agora?`;
  } else {
    const names = staleAssets.map((a) => a.name).join(' e ');
    body = `Faz pelo menos 7 dias desde a última leitura de ${names}. Se quiser, me mande por aqui as medições atuais.`;
  }

  return {
    body,
    linkedEntities: staleAssets.map((asset) => ({
      entity_type: 'asset',
      entity_id: asset.id,
      tab: 'cuidados',
      label: asset.name,
      live_state: 'open',
      can_undo: false,
    })),
  };
}
