import { useId, useState, type FormEvent } from 'react';
import { PhoneCall, Trash2 } from 'lucide-react';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { triggerHaptic } from '@/lib/platform';
import { getLocalDateString } from '@/lib/timezone';
import { useAuthStore } from '@/store/useAuthStore';
import { useDataStore } from '@/store/useDataStore';
import type { MuralNote } from '@/types';

interface MuralModalProps {
  open: boolean;
  onClose: () => void;
  initialNote?: MuralNote | null;
}

function extractDateAndTime(
  iso: string | null | undefined,
  tz: string,
): {
  dateStr: string;
  timeStr: string;
} {
  if (!iso) {
    return {
      dateStr: getLocalDateString(new Date(), tz),
      timeStr: '15:00',
    };
  }
  const dt = new Date(iso);
  if (Number.isNaN(dt.getTime())) {
    return {
      dateStr: getLocalDateString(new Date(), tz),
      timeStr: '15:00',
    };
  }
  const dateStr = getLocalDateString(dt, tz);
  const timeStr = new Intl.DateTimeFormat('pt-BR', {
    timeZone: tz,
    hour: '2-digit',
    minute: '2-digit',
    hourCycle: 'h23',
  }).format(dt);
  return { dateStr, timeStr };
}

function MuralModalForm({
  onClose,
  initialNote,
}: Omit<MuralModalProps, 'open'>) {
  const profile = useAuthStore((s) => s.profile);
  const partner = useAuthStore((s) => s.partner);
  const saveMuralNote = useDataStore((s) => s.saveMuralNote);
  const deleteMuralNote = useDataStore((s) => s.deleteMuralNote);

  const initialDateTime = extractDateAndTime(
    initialNote?.notify_at,
    profile.timezone,
  );

  const formId = useId();
  const [body, setBody] = useState(initialNote?.body ?? '');
  const [recipientRole, setRecipientRole] = useState<'partner' | 'me'>(
    initialNote && initialNote.recipient_id === profile.id ? 'me' : 'partner',
  );
  const [notifyDate, setNotifyDate] = useState(initialDateTime.dateStr);
  const [notifyTime, setNotifyTime] = useState(initialDateTime.timeStr);
  const [alarmCallMode, setAlarmCallMode] = useState(
    Boolean(initialNote?.alarm_call_mode),
  );
  const [toggleInit, setToggleInit] = useState(false);
  const [saving, setSaving] = useState(false);

  const partnerName = partner?.display_name || 'Esposa';

  async function handleSubmit(e: FormEvent) {
    e.preventDefault();
    const cleanBody = body.trim();
    if (!cleanBody || saving) return;

    setSaving(true);
    try {
      let notifyAt: string | null = null;
      if (notifyDate && notifyTime) {
        const parsed = new Date(`${notifyDate}T${notifyTime}:00`);
        if (!Number.isNaN(parsed.getTime())) {
          notifyAt = parsed.toISOString();
        }
      }

      void triggerHaptic('success');
      await saveMuralNote({
        id: initialNote?.id,
        body: cleanBody,
        recipient_role: recipientRole,
        notify_at: notifyAt,
        alarm_call_mode: alarmCallMode,
      });
      onClose();
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!initialNote || saving) return;
    setSaving(true);
    try {
      void triggerHaptic('warning');
      await deleteMuralNote(initialNote.id);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  return (
    <form onSubmit={(e) => void handleSubmit(e)} className="space-y-4">
      <div className="space-y-1">
        <label
          htmlFor={`${formId}-body`}
          className="block text-xs font-medium text-text-secondary"
        >
          Recado *
        </label>
        <textarea
          id={`${formId}-body`}
          name="body"
          rows={2}
          value={body}
          onChange={(e) => setBody(e.target.value)}
          placeholder="Ex: Estender a roupa do varal, passar na farmácia..."
          required
          autoFocus
          className="w-full p-3 rounded-xl bg-surface-3 border border-border text-sm text-text placeholder:text-text-dim"
        />
      </div>

      <fieldset className="space-y-1.5 border-0 p-0 m-0">
        <legend className="text-xs font-medium text-text-secondary">
          Para quem é o lembrete
        </legend>
        <div className="grid grid-cols-2 gap-2">
          <button
            type="button"
            aria-pressed={recipientRole === 'partner'}
            onClick={() => setRecipientRole('partner')}
            className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium transition-colors ${
              recipientRole === 'partner'
                ? 'bg-shared text-accent-foreground border-shared'
                : 'bg-surface-3 border-border-soft text-text-secondary'
            }`}
          >
            Para {partnerName}
          </button>
          <button
            type="button"
            aria-pressed={recipientRole === 'me'}
            onClick={() => setRecipientRole('me')}
            className={`min-h-[40px] px-3 rounded-xl border text-xs font-medium transition-colors ${
              recipientRole === 'me'
                ? 'bg-accent text-accent-foreground border-accent'
                : 'bg-surface-3 border-border-soft text-text-secondary'
            }`}
          >
            Para mim
          </button>
        </div>
      </fieldset>

      <div className="grid grid-cols-2 gap-3">
        <div className="space-y-1">
          <label
            htmlFor={`${formId}-date`}
            className="block text-xs font-medium text-text-secondary"
          >
            Data do aviso
          </label>
          <input
            id={`${formId}-date`}
            name="notify_date"
            type="date"
            value={notifyDate}
            onChange={(e) => setNotifyDate(e.target.value)}
            className="w-full h-11 px-3 rounded-xl bg-surface-3 border border-border text-sm text-text"
          />
        </div>

        <div className="space-y-1">
          <label
            htmlFor={`${formId}-time`}
            className="block text-xs font-medium text-text-secondary"
          >
            Horário do aviso
          </label>
          <input
            id={`${formId}-time`}
            name="notify_time"
            type="time"
            value={notifyTime}
            onChange={(e) => setNotifyTime(e.target.value)}
            className="w-full h-11 px-3 rounded-xl bg-surface-3 border border-border text-sm text-text"
          />
        </div>
      </div>

      {/* Toggle estritamente opt-in Modo Ligação */}
      <div
        className={`p-3 rounded-2xl border flex items-center justify-between gap-3 transition-colors ${
          alarmCallMode
            ? 'bg-danger-soft border-danger/40'
            : 'bg-surface-3 border-border-soft'
        }`}
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <PhoneCall
            className={`h-4 w-4 shrink-0 ${
              alarmCallMode ? 'text-danger' : 'text-text-muted'
            }`}
          />
          <div className="min-w-0">
            <p
              className={`text-xs font-semibold ${
                alarmCallMode ? 'text-danger' : 'text-text'
              }`}
            >
              Tocar como ligação
            </p>
            <p className="text-[11px] text-text-muted">
              Despertador de tela cheia para recados urgentes
            </p>
          </div>
        </div>

        <button
          type="button"
          role="switch"
          aria-checked={alarmCallMode}
          aria-label="Tocar como ligação"
          data-on={alarmCallMode ? 'true' : 'false'}
          onClick={() => {
            setToggleInit(true);
            setAlarmCallMode((v) => !v);
          }}
          className={`t-toggle ${
            toggleInit ? 'is-init' : ''
          } h-7 w-11 rounded-full p-1 flex items-center shrink-0 border ${
            alarmCallMode
              ? 'bg-danger border-danger'
              : 'bg-surface-2 border-border'
          }`}
        >
          <span className="t-toggle-thumb h-5 w-5 rounded-full bg-white block shadow-sm" />
        </button>
      </div>

      <div className="flex items-center justify-between gap-2 pt-2 border-t border-border">
        {initialNote ? (
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleDelete()}
            className="min-h-[40px] px-3.5 rounded-full bg-danger-soft border border-danger/35 text-xs font-semibold text-danger inline-flex items-center gap-1.5 hover:opacity-90"
          >
            <Trash2 className="h-3.5 w-3.5" />
            <span>Excluir</span>
          </button>
        ) : (
          <span />
        )}

        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={onClose}
            className="min-h-[40px] px-4 rounded-full bg-surface-3 border border-border text-xs font-medium text-text-secondary hover:text-text"
          >
            Cancelar
          </button>
          <button
            type="submit"
            disabled={saving}
            className="min-h-[40px] px-5 rounded-full bg-shared text-accent-foreground text-xs font-semibold hover:opacity-90 transition-opacity"
          >
            {initialNote ? 'Salvar recado' : 'Publicar no Mural'}
          </button>
        </div>
      </div>
    </form>
  );
}

export function MuralModal({
  open,
  onClose,
  initialNote = null,
}: MuralModalProps) {
  const formKey = `${open ? 'open' : 'closed'}-${initialNote?.id ?? 'new'}`;

  return (
    <ModalDialog
      open={open}
      onClose={onClose}
      title={initialNote ? 'Editar recado do Mural' : 'Novo recado no Mural'}
      subtitle="Envia notificação no horário combinado para o celular escolhido."
    >
      <MuralModalForm
        key={formKey}
        onClose={onClose}
        initialNote={initialNote}
      />
    </ModalDialog>
  );
}
