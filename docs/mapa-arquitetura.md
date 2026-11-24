# Mapa de Arquitetura — Meu Dia

> **Regra de Governança Obrigatória:** Mantenha este índice atualizado sempre que qualquer arquivo em `src/`, `supabase/`, `scripts/` ou `tests/` for criado, renomeado ou removido.
>
> **Fronteiras de Pasta da Squad (Fase 2+):**
> - `frontend-ui`: dono exclusivo de `index.html`, `src/styles/**`, `src/components/**`, `src/pages/**`.
> - `backend-core`: dono exclusivo de `supabase/**`, `src/lib/**`, `src/services/**`, `src/store/**`, `android/**`, `scripts/**`.
> - `coordinator`: contratos compartilhados em `src/types/**`, `src/App.tsx`, `src/main.tsx` e configurações de raiz.

---

## Raiz & Configuração
- `index.html` — Documento raiz `pt-BR` em tema escuro (`color-scheme: dark`), fontes `Sora` e `Inter` e `viewport-fit=cover`.
- `package.json` — Scripts (`dev`, `build`, `typecheck`, `lint`, `test`) e dependências da stack React 19 + Vite + Tailwind v4 + Capacitor.
- `vite.config.ts` — Build Vite com `@vitejs/plugin-react`, `@tailwindcss/vite` e alias `@/*`.
- `vitest.config.ts` — Configuração de testes unitários e de componentes com `jsdom`.
- `capacitor.config.ts` — Configuração nativa Android (`com.meudia.app`, `https`, `SplashScreen`, `LocalNotifications`).
- `.env.example` — Variáveis públicas do cliente Supabase (`VITE_SUPABASE_URL`, `VITE_SUPABASE_ANON_KEY`), sem segredos.

## `src/` (Entrada)
- `src/vite-env.d.ts` — Tipagens globais do cliente Vite (`ImportMeta.env` e imports de estilos).
- `src/main.tsx` — Inicialização React 19, `QueryClientProvider` e `MotionConfig reducedMotion="user"`.
- `src/App.tsx` — Bootstrap da sessão/perfil (`useAuthStore.initialize`) e montagem do `AppShell`.

## `src/types/` (Contratos Travados)
- `src/types/common.ts` — Primitivos (`UUID`, datas ISO, escopo `personal|shared`, abas, horizontes e `SyncBaseEntity`).
- `src/types/auth.ts` — `UserProfile`, preferências de pausa, `Household`, `PartnerSummary` e `HouseholdInvite` (24h).
- `src/types/chat.ts` — `ChatMessage`, referências vivas `LinkedEntityRef`, `ClarificationPayload` e payload de `assistant-ingest`.
- `src/types/agenda.ts` — `Task` (`today|week|month|later`, `open|waiting|done|archived`, `alarm_call_mode`) e `PauseSession`.
- `src/types/casa.ts` — `MuralNote` e `HouseRoutine` (regra enxuta `fixed_weekdays|cyclic_days` + próxima ocorrência).
- `src/types/cuidados.ts` — `Asset`, `CareRule` (`flexible_days|meter|annual_date`) e histórico técnico `CareServiceLog`.
- `src/types/guardados.ts` — `VaultItem` (`print|link|study|work`).
- `src/types/notifications.ts` — `DevicePushToken`, `NotificationJob` (`push|call_alarm`) e `AndroidNotificationDiagnostics`.
- `src/types/sync.ts` — Fila offline `OutboxMutation`, fila de upload `MediaUploadTask` e `BackupExportPayload`.
- `src/types/platform.ts` — Contratos da camada de abstração Web vs. Capacitor (`PlatformAdapter`).
- `src/types/index.ts` — Barrel export unificado dos contratos.

## `src/styles/` (Design System Escuro & Motion)
- `src/styles/tokens.css` — Paleta escura profunda OLED, bordas translúcidas, tipografia, raios, sombras e safe-areas.
- `src/styles/motion.css` — Escala semântica de movimento (`--duration-*`, `--ease-*`, `--distance-*`, `--scale-*`, `--blur-*`) + `prefers-reduced-motion`.
- `src/styles/global.css` — Integração Tailwind CSS v4 (`@theme`), superfícies, bolhas de conversa, `<dialog:modal>` com contenção de scroll e accordion CSS Grid.

## `src/lib/` (Utilitários & Abstração de Plataforma)
- `src/lib/uuid.ts` — Geração UUID v4 client-side (`crypto.randomUUID` + fallback RFC 4122).
- `src/lib/timezone.ts` — Cálculos explícitos em `America/Sao_Paulo` (`getLocalDateString`, `getLocalIsoNow`, formatação de data).
- `src/lib/supabase.ts` — Cliente Supabase resiliente com fallback local seguro quando `.env` está vazio.
- `src/lib/platform/runtime.ts` — Detecção segura de ambiente (`web` vs. `android` nativo Capacitor).
- `src/lib/platform/haptics.ts` — Feedback tátil nativo no Android com fallback silencioso na Web.
- `src/lib/platform/notifications.ts` — Diagnóstico de permissões, agendamento e cancelamento de alarmes locais com fallback Web.
- `src/lib/platform/shareTarget.ts` — Barramento de eventos para recebimento do Android Share Target.
- `src/lib/platform/media.ts` — Redimensionamento e compressão client-side de fotos/prints para ~150 KB com prévia local imediata.
- `src/lib/platform/index.ts` — Fachada `platformAdapter` consolidada.

## `src/services/` (Serviços de Domínio & Infra)
- `src/services/authService.ts` — Autenticação para 2 contas independentes, perfil, geração e resgate de convite curto de 24h (`MD-XXXXXX`).
- `src/services/mediaService.ts` — Upload para o bucket privado `meu-dia-media` (`personal/` e `shared/`) e acesso exclusivo via Signed URLs com cache.

## `src/store/` (Estado Global Zustand)
- `src/store/useAuthStore.ts` — Sessão, perfil local/remoto, parceiro vinculado e gerenciamento de convites da Casa.
- `src/store/useUiStore.ts` — Navegação Mobile/PC Split View, horizonte da Agenda, diálogos e sessão do modo `Descansar`.

## `src/components/` (Componentes Visuais)
- `src/components/ui/ModalDialog.tsx` — Wrapper acessível para `<dialog>` nativo com `closedby="any"` e fallback light-dismiss.
- `src/components/layout/TopBar.tsx` — Cabeçalho compacto com avatar, seletor Split View no PC, Busca Global e `Descansar`.
- `src/components/layout/BottomNav.tsx` — Barra inferior mobile com 5 abas no alcance do polegar e pílula animada.
- `src/components/layout/AppShell.tsx` — Casca adaptativa (Mobile 1 coluna + Bottom Bar | PC Split View com Conversa fixa à direita).
- `src/components/modals/GlobalSearchDialog.tsx` — Diálogo de busca global (`Ctrl+K` / lupa).
- `src/components/modals/PauseDialog.tsx` — Configuração rápida do modo `Descansar` (15 / 20 / 30 min).
- `src/components/settings/SettingsDialog.tsx` — Perfil, fuso `America/Sao_Paulo`, Auth de 2 contas e pareamento 24h.

## `src/pages/` (Páginas das 5 Áreas)
- `src/pages/ChatPane.tsx` — Painel da `Conversa` cronológica com entrada de texto, mídia, áudio e atalhos vivos.
- `src/pages/AgendaPage.tsx` — `Agenda` (`Hoje | Semana | Mês | Depois`), banner discreto de dias anteriores, `Aguardando retorno` e tela de pausa.
- `src/pages/CasaPage.tsx` — `Mural` com horário, `Tarefas e rotinas da casa` (`Tudo | Meu | Dela | Os dois`) e lembrete de mercado.
- `src/pages/CuidadosPage.tsx` — Cartões de ativos com divulgação progressiva de garantia, ciclos e histórico.
- `src/pages/GuardadosPage.tsx` — Cofre pessoal filtrado por `Prints`, `Links`, `Estudos` e `Trabalho`.

## `supabase/` (Banco de Dados, RLS & Funções)
- `supabase/config.toml` — Configuração local do projeto Supabase `meu-dia`.
- `supabase/migrations/0001_initial_schema.sql` — Schema completo (12 tabelas), triggers de `updated_at`, RPCs seguras de pareamento 24h, cancelamento automático de `notification_jobs`, trava atômica `SKIP LOCKED`, RLS rigoroso e bucket privado `meu-dia-media`.

## `tests/` (Suíte Automatizada Vitest)
- `tests/setup.ts` — Setup global `@testing-library/jest-dom` e polyfill leve de `HTMLDialogElement` para `jsdom`.
- `tests/phase1/timezone.test.ts` — Testes de fuso `America/Sao_Paulo` e proteção contra virada de dia precoce em UTC.
- `tests/phase1/platform.test.ts` — Testes de fallback silencioso na Web e cálculo/compressão de imagens.
- `tests/phase1/pairing-media.test.ts` — Testes de convite 24h (`MD-XXXXXX`) e paths privados `personal/` vs. `shared/`.
- `tests/phase1/rls-schema.test.ts` — Auditoria automatizada de RLS, isolamento privado/compartilhado, bucket privado, triggers de cancelamento e zero segredos no código cliente.
- `tests/phase1/shell.test.tsx` — Testes de renderização da casca, navegação, modo `Descansar` e ausência de jargões banidos.
