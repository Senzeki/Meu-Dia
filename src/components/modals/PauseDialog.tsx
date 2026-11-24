import { useState } from 'react';
import { Leaf } from 'lucide-react';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { triggerHaptic } from '@/lib/platform';
import { useUiStore } from '@/store/useUiStore';

const DURATIONS: Array<15 | 20 | 30> = [15, 20, 30];

export function PauseDialog() {
  const open = useUiStore((s) => s.pauseModalOpen);
  const setPauseModalOpen = useUiStore((s) => s.setPauseModalOpen);
  const pauseSession = useUiStore((s) => s.pauseSession);
  const startPause = useUiStore((s) => s.startPause);
  const endPause = useUiStore((s) => s.endPause);
  const [selectedMinutes, setSelectedMinutes] = useState<15 | 20 | 30>(20);

  return (
    <ModalDialog
      open={open}
      onClose={() => setPauseModalOpen(false)}
      title="Momento de descanso"
      subtitle="Oculta listas de tarefas e silencia avisos não urgentes pelo tempo escolhido."
      maxWidthClass="max-w-[420px]"
    >
      <div className="space-y-5">
        <div className="flex items-center gap-3.5 p-3.5 surface-item">
          <div className="h-11 w-11 rounded-2xl bg-success-soft text-success flex items-center justify-center shrink-0">
            <Leaf className="h-5 w-5" />
          </div>
          <p className="text-xs text-text-secondary leading-relaxed">
            Apenas lembretes marcados manualmente como ligação urgente continuam ativos.
          </p>
        </div>

        <div>
          <p className="text-xs font-medium text-text-secondary mb-2">Duração da pausa</p>
          <div className="grid grid-cols-3 gap-2">
            {DURATIONS.map((mins) => {
              const active = selectedMinutes === mins;
              return (
                <button
                  key={mins}
                  type="button"
                  onClick={() => setSelectedMinutes(mins)}
                  className={`h-11 rounded-xl border text-xs font-semibold transition-colors ${
                    active
                      ? 'bg-accent text-accent-foreground border-accent'
                      : 'bg-surface-3 text-text-secondary border-border-soft hover:bg-surface-4'
                  }`}
                >
                  {mins} min
                </button>
              );
            })}
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 pt-1">
          {pauseSession.active ? (
            <button
              type="button"
              onClick={() => {
                endPause();
                setPauseModalOpen(false);
              }}
              className="h-10 px-4 rounded-full bg-surface-3 border border-border text-xs font-medium text-text hover:bg-surface-4"
            >
              Retomar rotina agora
            </button>
          ) : null}

          <button
            type="button"
            onClick={() => {
              void triggerHaptic('success');
              startPause(selectedMinutes);
            }}
            className="h-10 px-5 rounded-full bg-success text-accent-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            Iniciar {selectedMinutes} min
          </button>
        </div>
      </div>
    </ModalDialog>
  );
}
