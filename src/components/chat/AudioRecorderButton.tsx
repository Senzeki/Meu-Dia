import { useEffect, useRef, useState } from 'react';
import { Mic, Send, X } from 'lucide-react';
import { triggerHaptic } from '@/lib/platform';

interface AudioRecorderButtonProps {
  disabled?: boolean;
  onAudioReady: (blob: Blob, durationSeconds: number) => Promise<void>;
  onErrorNotice: (message: string | null) => void;
  onRecordingChange?: (recording: boolean) => void;
}

const MAX_DURATION_SECONDS = 90;

function pickSupportedAudioMimeType(): string {
  if (typeof MediaRecorder === 'undefined') return '';
  const candidates = [
    'audio/webm;codecs=opus',
    'audio/mp4',
    'audio/webm',
    'audio/ogg;codecs=opus',
  ];
  for (const mime of candidates) {
    if (
      typeof MediaRecorder.isTypeSupported === 'function' &&
      MediaRecorder.isTypeSupported(mime)
    ) {
      return mime;
    }
  }
  return '';
}

function formatSecondsMmSs(seconds: number): string {
  const clamped = Math.max(
    0,
    Math.min(MAX_DURATION_SECONDS, Math.floor(seconds)),
  );
  const mins = Math.floor(clamped / 60);
  const secs = clamped % 60;
  return `${mins}:${String(secs).padStart(2, '0')}`;
}

export function AudioRecorderButton({
  disabled = false,
  onAudioReady,
  onErrorNotice,
  onRecordingChange,
}: AudioRecorderButtonProps) {
  const [recording, setRecording] = useState(false);
  const [elapsedSeconds, setElapsedSeconds] = useState(0);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const chunksRef = useRef<BlobPart[]>([]);
  const startTimestampRef = useRef<number>(0);
  const timerRef = useRef<number | null>(null);
  const discardOnStopRef = useRef<boolean>(false);

  function updateRecordingState(next: boolean) {
    setRecording(next);
    onRecordingChange?.(next);
  }

  function cleanupStreamAndTimer() {
    if (timerRef.current !== null) {
      window.clearInterval(timerRef.current);
      timerRef.current = null;
    }
    if (streamRef.current) {
      for (const track of streamRef.current.getTracks()) {
        track.stop();
      }
      streamRef.current = null;
    }
    recorderRef.current = null;
  }

  useEffect(() => {
    return () => {
      discardOnStopRef.current = true;
      if (recorderRef.current && recorderRef.current.state !== 'inactive') {
        try {
          recorderRef.current.stop();
        } catch {
          // ignore cleanup error
        }
      }
      cleanupStreamAndTimer();
    };
  }, []);

  async function startRecording() {
    onErrorNotice(null);

    if (
      typeof navigator === 'undefined' ||
      !navigator.mediaDevices ||
      typeof navigator.mediaDevices.getUserMedia !== 'function' ||
      typeof MediaRecorder === 'undefined'
    ) {
      onErrorNotice(
        'Gravação de áudio indisponível neste navegador ou aparelho.',
      );
      return;
    }

    try {
      void triggerHaptic('light');
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const mimeType = pickSupportedAudioMimeType();
      const recorder = mimeType
        ? new MediaRecorder(stream, { mimeType })
        : new MediaRecorder(stream);

      chunksRef.current = [];
      discardOnStopRef.current = false;
      startTimestampRef.current = Date.now();
      recorderRef.current = recorder;

      recorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) {
          chunksRef.current.push(event.data);
        }
      };

      recorder.onstop = () => {
        const shouldDiscard = discardOnStopRef.current;
        const durationSec = Math.max(
          1,
          Math.min(
            MAX_DURATION_SECONDS,
            Math.round((Date.now() - startTimestampRef.current) / 1000),
          ),
        );
        const resolvedMime =
          recorder.mimeType || mimeType || 'audio/webm;codecs=opus';
        const recordedChunks = [...chunksRef.current];

        chunksRef.current = [];
        cleanupStreamAndTimer();
        updateRecordingState(false);
        setElapsedSeconds(0);

        if (shouldDiscard || recordedChunks.length === 0) {
          return;
        }

        const audioBlob = new Blob(recordedChunks, { type: resolvedMime });
        if (audioBlob.size > 0) {
          void onAudioReady(audioBlob, durationSec);
        }
      };

      recorder.start(250);
      updateRecordingState(true);
      setElapsedSeconds(0);

      timerRef.current = window.setInterval(() => {
        const sec = Math.floor((Date.now() - startTimestampRef.current) / 1000);
        if (sec >= MAX_DURATION_SECONDS) {
          setElapsedSeconds(MAX_DURATION_SECONDS);
          stopAndSendRecording();
        } else {
          setElapsedSeconds(sec);
        }
      }, 250);
    } catch {
      cleanupStreamAndTimer();
      updateRecordingState(false);
      onErrorNotice(
        'Não foi possível acessar o microfone. Verifique a permissão de áudio do navegador ou aparelho.',
      );
    }
  }

  function cancelRecording() {
    void triggerHaptic('light');
    discardOnStopRef.current = true;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        cleanupStreamAndTimer();
        updateRecordingState(false);
        setElapsedSeconds(0);
      }
    } else {
      cleanupStreamAndTimer();
      updateRecordingState(false);
      setElapsedSeconds(0);
    }
  }

  function stopAndSendRecording() {
    void triggerHaptic('success');
    discardOnStopRef.current = false;
    if (recorderRef.current && recorderRef.current.state !== 'inactive') {
      try {
        recorderRef.current.stop();
      } catch {
        cleanupStreamAndTimer();
        updateRecordingState(false);
        setElapsedSeconds(0);
      }
    }
  }

  if (recording) {
    const progressPct = Math.min(
      100,
      Math.round((elapsedSeconds / MAX_DURATION_SECONDS) * 100),
    );

    return (
      <div
        role="region"
        aria-label="Gravando áudio curto"
        className="flex-1 min-w-0 flex items-center justify-between gap-2 pl-3.5 pr-1.5 py-1 rounded-full bg-surface-2 border border-accent/40"
      >
        <div className="flex items-center gap-2.5 min-w-0">
          <span className="h-2.5 w-2.5 rounded-full bg-accent animate-pulse shrink-0" />
          <div className="min-w-0">
            <div className="flex items-center gap-2">
              <span className="text-xs font-medium text-text-secondary">
                Gravando
              </span>
              <span className="text-xs font-mono font-semibold text-text tabular-nums whitespace-nowrap">
                {formatSecondsMmSs(elapsedSeconds)} / 1:30
              </span>
            </div>
            <div className="h-1 w-24 sm:w-32 rounded-full bg-surface-4 overflow-hidden mt-1">
              <div
                className="h-full bg-accent transition-[width] duration-200 ease-out"
                style={{ width: `${progressPct}%` }}
              />
            </div>
          </div>
        </div>

        <div className="flex items-center gap-1.5 shrink-0">
          <button
            type="button"
            onClick={cancelRecording}
            aria-label="Cancelar gravação de áudio"
            title="Cancelar áudio"
            className="h-10 w-10 rounded-full bg-surface-3 border border-border-soft flex items-center justify-center text-text-muted hover:text-text transition-colors shrink-0"
          >
            <X className="h-4 w-4" />
          </button>

          <button
            type="button"
            onClick={stopAndSendRecording}
            aria-label="Enviar áudio gravado"
            title="Concluir e enviar áudio"
            className="h-10 px-3.5 rounded-full bg-accent text-accent-foreground text-xs font-semibold flex items-center gap-1.5 hover:bg-accent-hover transition-colors shrink-0"
          >
            <Send className="h-3.5 w-3.5" />
            <span>Enviar</span>
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      disabled={disabled}
      onClick={() => void startRecording()}
      aria-label="Gravar áudio curto"
      title="Gravar áudio curto (até 90s)"
      className="h-11 w-11 rounded-full bg-surface-2 border border-border flex items-center justify-center text-text-secondary hover:text-text hover:bg-surface-3 disabled:opacity-45 transition-colors shrink-0"
    >
      <Mic className="h-4 w-4" />
    </button>
  );
}
