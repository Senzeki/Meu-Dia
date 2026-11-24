import { useState, type FormEvent } from 'react';
import { Check, Copy, Globe, Link2, LogOut, ShieldCheck, Users } from 'lucide-react';
import { ModalDialog } from '@/components/ui/ModalDialog';
import { DEFAULT_TIMEZONE } from '@/lib/timezone';
import { useAuthStore } from '@/store/useAuthStore';
import { useUiStore } from '@/store/useUiStore';

export function SettingsDialog() {
  const open = useUiStore((s) => s.settingsOpen);
  const setSettingsOpen = useUiStore((s) => s.setSettingsOpen);

  const {
    cloudConfigured,
    loading,
    error,
    profile,
    partner,
    activeInvite,
    signIn,
    signUp,
    signOut,
    updateProfile,
    generateInvite,
    redeemInvite,
    clearError,
  } = useAuthStore();

  const [displayName, setDisplayName] = useState(profile.display_name);
  const [timezone, setTimezone] = useState(profile.timezone || DEFAULT_TIMEZONE);
  const [inviteInput, setInviteInput] = useState('');
  const [copied, setCopied] = useState(false);

  const [authMode, setAuthMode] = useState<'signin' | 'signup'>('signin');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  async function handleSaveProfile(e: FormEvent) {
    e.preventDefault();
    clearError();
    await updateProfile({ display_name: displayName, timezone });
    setFeedback('Preferências salvas.');
    setTimeout(() => setFeedback(null), 2500);
  }

  async function handleCopyInvite(code: string) {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch {
      // fallback sem erro ruidoso
    }
  }

  async function handleAuthSubmit(e: FormEvent) {
    e.preventDefault();
    clearError();
    setFeedback(null);
    if (authMode === 'signin') {
      await signIn(email, password);
      setFeedback('Sessão conectada.');
    } else {
      await signUp(email, password, displayName);
      setFeedback('Conta criada com sucesso.');
    }
  }

  async function handleRedeem(e: FormEvent) {
    e.preventDefault();
    clearError();
    if (!inviteInput.trim()) return;
    await redeemInvite(inviteInput);
    setInviteInput('');
    setFeedback('Espaço compartilhado vinculado.');
  }

  return (
    <ModalDialog
      open={open}
      onClose={() => setSettingsOpen(false)}
      title="Conta, Casa & Fuso Horário"
      subtitle="Funciona para 1 pessoa sozinha ou para 2 contas independentes vinculadas."
      maxWidthClass="max-w-[520px]"
    >
      <div className="space-y-5 max-h-[72dvh] overflow-y-auto pr-1">
        {error ? (
          <div className="p-3 rounded-xl bg-danger-soft border border-danger/30 text-xs text-danger">
            {error}
          </div>
        ) : null}

        {feedback ? (
          <div className="p-3 rounded-xl bg-success-soft border border-success/30 text-xs text-success">
            {feedback}
          </div>
        ) : null}

        {/* 1. Perfil & Fuso Horário */}
        <form onSubmit={handleSaveProfile} className="space-y-3">
          <div className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
            <Globe className="h-3.5 w-3.5 text-accent" />
            <span>Perfil e fuso horário</span>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <label className="block space-y-1">
              <span className="text-xs text-text-muted">Seu nome</span>
              <input
                type="text"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                required
                className="w-full h-10 px-3 rounded-xl bg-surface-3 border border-border text-sm text-text"
              />
            </label>

            <label className="block space-y-1">
              <span className="text-xs text-text-muted">Fuso horário</span>
              <select
                value={timezone}
                onChange={(e) => setTimezone(e.target.value)}
                className="w-full h-10 px-3 rounded-xl bg-surface-3 border border-border text-sm text-text"
              >
                <option value="America/Sao_Paulo">America/Sao_Paulo (Brasília)</option>
                <option value="America/Manaus">America/Manaus</option>
                <option value="America/Cuiaba">America/Cuiaba</option>
                <option value="America/Fortaleza">America/Fortaleza</option>
              </select>
            </label>
          </div>

          <div className="flex justify-end">
            <button
              type="submit"
              disabled={loading}
              className="h-9 px-4 rounded-full bg-surface-3 border border-border text-xs font-medium text-text hover:bg-surface-4"
            >
              Salvar perfil
            </button>
          </div>
        </form>

        {/* 2. Pareamento de Casa (24h) */}
        <div className="pt-4 border-t border-border space-y-3">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
              <Users className="h-3.5 w-3.5 text-shared" />
              <span>Pareamento da Casa (2 contas)</span>
            </div>
            <span className="text-[11px] px-2.5 py-0.5 rounded-full bg-surface-3 border border-border-soft text-text-muted">
              {partner ? `Conectado com ${partner.display_name}` : 'Uso individual'}
            </span>
          </div>

          <p className="text-xs text-text-muted leading-relaxed">
            Conversa, Agenda pessoal e Guardados permanecem privados em cada conta. Apenas
            Casa, Mural e ativos marcados como compartilhados ficam visíveis aos dois.
          </p>

          <div className="p-3.5 surface-item space-y-3">
            <div className="flex items-center justify-between gap-3">
              <div>
                <p className="text-xs font-medium text-text">Convidar segunda conta</p>
                <p className="text-[11px] text-text-muted">Código de uso único válido por 24 horas</p>
              </div>
              <button
                type="button"
                disabled={loading}
                onClick={() => void generateInvite()}
                className="h-9 px-3.5 rounded-full bg-accent text-accent-foreground text-xs font-semibold shrink-0 hover:bg-accent-hover transition-colors"
              >
                Gerar código 24h
              </button>
            </div>

            {activeInvite ? (
              <div className="flex items-center justify-between gap-2 p-2.5 rounded-xl bg-surface-2 border border-border">
                <div>
                  <p className="font-mono text-sm font-semibold tracking-wider text-accent">
                    {activeInvite.code}
                  </p>
                  <p className="text-[11px] text-text-muted">
                    Expira em {new Date(activeInvite.expires_at).toLocaleString('pt-BR')}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => void handleCopyInvite(activeInvite.code)}
                  className="h-8 px-3 rounded-full bg-surface-3 border border-border text-xs font-medium flex items-center gap-1.5 text-text"
                >
                  {copied ? <Check className="h-3.5 w-3.5 text-success" /> : <Copy className="h-3.5 w-3.5" />}
                  <span>{copied ? 'Copiado' : 'Copiar'}</span>
                </button>
              </div>
            ) : null}

            <form onSubmit={handleRedeem} className="flex items-center gap-2 pt-1">
              <div className="relative flex-1">
                <Link2 className="h-3.5 w-3.5 text-text-muted absolute left-3 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={inviteInput}
                  onChange={(e) => setInviteInput(e.target.value)}
                  placeholder="Recebeu um código? Ex: MD-7K4P9Q"
                  className="w-full h-9 pl-8 pr-3 rounded-xl bg-surface-2 border border-border text-xs text-text uppercase placeholder:normal-case placeholder:text-text-dim"
                />
              </div>
              <button
                type="submit"
                disabled={loading || !inviteInput.trim()}
                className="h-9 px-3.5 rounded-xl bg-shared-soft border border-shared/30 text-shared text-xs font-semibold disabled:opacity-50"
              >
                Vincular
              </button>
            </form>
          </div>
        </div>

        {/* 3. Conta Supabase Cloud */}
        <div className="pt-4 border-t border-border space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 text-xs font-semibold text-text-secondary">
              <ShieldCheck className="h-3.5 w-3.5 text-success" />
              <span>Sincronização na nuvem</span>
            </div>
            {profile.email ? (
              <button
                type="button"
                onClick={() => void signOut()}
                className="text-xs text-text-muted hover:text-text flex items-center gap-1"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sair</span>
              </button>
            ) : null}
          </div>

          {!cloudConfigured ? (
            <p className="text-xs text-text-muted p-3 rounded-xl bg-surface-3 border border-border-soft leading-relaxed">
              Funcionando neste aparelho em modo local. A sincronização entre celulares e computador ficará ativa assim que a conexão com a nuvem estiver configurada.
            </p>
          ) : profile.email ? (
            <p className="text-xs text-text-secondary p-3 rounded-xl bg-surface-3 border border-border-soft">
              Autenticado como <strong className="text-text">{profile.email}</strong>
            </p>
          ) : (
            <form onSubmit={handleAuthSubmit} className="space-y-2.5 p-3.5 surface-item">
              <div className="flex gap-2 pb-1">
                <button
                  type="button"
                  onClick={() => setAuthMode('signin')}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    authMode === 'signin'
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-surface-2 text-text-muted'
                  }`}
                >
                  Entrar
                </button>
                <button
                  type="button"
                  onClick={() => setAuthMode('signup')}
                  className={`px-3 py-1 rounded-full text-xs font-medium ${
                    authMode === 'signup'
                      ? 'bg-accent text-accent-foreground'
                      : 'bg-surface-2 text-text-muted'
                  }`}
                >
                  Criar conta
                </button>
              </div>

              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="E-mail"
                required
                className="w-full h-10 px-3 rounded-xl bg-surface-2 border border-border text-sm text-text"
              />
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                placeholder="Senha (mínimo 6 caracteres)"
                minLength={6}
                required
                className="w-full h-10 px-3 rounded-xl bg-surface-2 border border-border text-sm text-text"
              />
              <button
                type="submit"
                disabled={loading}
                className="w-full h-10 rounded-xl bg-accent text-accent-foreground text-xs font-semibold"
              >
                {authMode === 'signin' ? 'Entrar na conta' : 'Criar conta'}
              </button>
            </form>
          )}
        </div>
      </div>
    </ModalDialog>
  );
}
