import { useCallback, useEffect, useState } from 'react';
import {
  BatteryCharging,
  Bell,
  Clock,
  ExternalLink,
  PhoneCall,
  RefreshCw,
} from 'lucide-react';
import { platformAdapter, triggerHaptic } from '@/lib/platform';
import type {
  AndroidNotificationDiagnostics,
  DiagnosticPermissionState,
} from '@/types';

type SettingsTarget = 'notifications' | 'exact_alarm' | 'full_screen' | 'battery';

interface DiagnosticRowConfig {
  key: keyof Pick<
    AndroidNotificationDiagnostics,
    | 'notifications_permission'
    | 'exact_alarms_allowed'
    | 'full_screen_intent_allowed'
    | 'battery_optimization_ignored'
  >;
  target: SettingsTarget;
  title: string;
  description: string;
  icon: typeof Bell;
}

const DIAGNOSTIC_ROWS: DiagnosticRowConfig[] = [
  {
    key: 'notifications_permission',
    target: 'notifications',
    title: 'Permissão de notificações',
    description: 'Mensagens do assistente e recados do Mural.',
    icon: Bell,
  },
  {
    key: 'exact_alarms_allowed',
    target: 'exact_alarm',
    title: 'Alarmes exatos no horário',
    description: 'Garante disparo pontual mesmo com o celular bloqueado.',
    icon: Clock,
  },
  {
    key: 'full_screen_intent_allowed',
    target: 'full_screen',
    title: 'Alarme em tela cheia (Modo Ligação)',
    description: 'Exibe alerta contínuo apenas nos itens urgentes ativados.',
    icon: PhoneCall,
  },
  {
    key: 'battery_optimization_ignored',
    target: 'battery',
    title: 'Bateria em segundo plano',
    description: 'Evita que o Android adie lembretes quando o app estiver fechado.',
    icon: BatteryCharging,
  },
];

function getStatusBadge(state: DiagnosticPermissionState): {
  label: string;
  className: string;
} {
  switch (state) {
    case 'granted':
      return {
        label: 'Permitido',
        className: 'bg-success-soft text-success border-success/25',
      };
    case 'denied':
      return {
        label: 'Ajustar',
        className: 'bg-warning-soft text-warning border-warning/30',
      };
    case 'prompt':
      return {
        label: 'Pendente',
        className: 'bg-warning-soft text-warning border-warning/30',
      };
    case 'not_applicable':
    default:
      return {
        label: 'Apenas no Android',
        className: 'bg-surface-2 text-text-muted border-border-soft',
      };
  }
}

export function NotificationDiagnosticsCard() {
  const [diagnostics, setDiagnostics] =
    useState<AndroidNotificationDiagnostics | null>(null);
  const [checking, setChecking] = useState(false);

  const loadDiagnostics = useCallback(async () => {
    setChecking(true);
    try {
      const result = await platformAdapter.getNotificationDiagnostics();
      setDiagnostics(result);
    } finally {
      setChecking(false);
    }
  }, []);

  useEffect(() => {
    let active = true;
    void platformAdapter.getNotificationDiagnostics().then((result) => {
      if (active) {
        setDiagnostics(result);
      }
    });
    return () => {
      active = false;
    };
  }, []);

  async function handleRequestPermission() {
    setChecking(true);
    try {
      void triggerHaptic('light');
      const updated = await platformAdapter.requestNotificationPermissions();
      setDiagnostics(updated);
    } finally {
      setChecking(false);
    }
  }

  async function handleOpenSettings(target: SettingsTarget) {
    void triggerHaptic('light');
    await platformAdapter.openSystemNotificationSettings(target);
  }

  const isWeb = diagnostics?.platform !== 'android';

  return (
    <div className="pt-4 border-t border-border space-y-3">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <div className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
          <Bell className="h-3.5 w-3.5 text-accent" />
          <span>Diagnóstico de notificações</span>
        </div>

        <button
          type="button"
          disabled={checking}
          onClick={() => void loadDiagnostics()}
          className="min-h-[40px] px-3 rounded-full bg-surface-3 border border-border text-xs font-medium text-text-secondary hover:text-text inline-flex items-center gap-1.5 transition-colors"
        >
          <RefreshCw
            className={`h-3.5 w-3.5 text-accent ${
              checking ? 'animate-spin' : ''
            }`}
          />
          <span>Atualizar status</span>
        </button>
      </div>

      {isWeb ? (
        <p className="text-xs text-text-muted leading-relaxed">
          Você está na versão Web/PC. Os ajustes avançados de alarme exato, tela cheia e bateria valem no aplicativo Android.
        </p>
      ) : null}

      <div className="space-y-2">
        {DIAGNOSTIC_ROWS.map((row) => {
          const Icon = row.icon;
          const state: DiagnosticPermissionState = diagnostics
            ? diagnostics[row.key]
            : 'prompt';
          const badge = getStatusBadge(state);
          const needsAttention = state === 'prompt' || state === 'denied';

          return (
            <div
              key={row.key}
              className="p-3 surface-item flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2.5"
            >
              <div className="flex items-start gap-2.5 min-w-0 flex-1">
                <Icon className="h-4 w-4 text-text-muted mt-0.5 shrink-0" />
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold text-text">
                      {row.title}
                    </p>
                    <span
                      className={`text-[11px] px-2 py-0.5 rounded-full border font-medium ${badge.className}`}
                    >
                      {badge.label}
                    </span>
                  </div>
                  <p className="text-[11px] text-text-muted mt-0.5 leading-relaxed">
                    {row.description}
                  </p>
                </div>
              </div>

              {needsAttention ? (
                <div className="flex items-center gap-1.5 shrink-0">
                  {row.key === 'notifications_permission' ? (
                    <button
                      type="button"
                      disabled={checking}
                      onClick={() => void handleRequestPermission()}
                      className="min-h-[40px] px-3.5 rounded-full bg-accent text-accent-foreground text-xs font-semibold hover:bg-accent-hover transition-colors"
                    >
                      Permitir
                    </button>
                  ) : null}

                  {!isWeb ? (
                    <button
                      type="button"
                      onClick={() => void handleOpenSettings(row.target)}
                      className="min-h-[40px] px-3 rounded-full bg-surface-2 border border-border text-xs font-medium text-text-secondary hover:text-text inline-flex items-center gap-1 transition-colors"
                    >
                      <span>Abrir ajuste</span>
                      <ExternalLink className="h-3 w-3" />
                    </button>
                  ) : null}
                </div>
              ) : null}
            </div>
          );
        })}
      </div>
    </div>
  );
}
