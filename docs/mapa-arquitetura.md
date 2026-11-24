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
- `src/types/bridges.ts` — Contratos das pontes opcionais (`Rotinas de Casa` e `Passatempos`) e ações de notificação (`NotificationActionPayload`).
- `src/types/domain.ts` — Contrato completo de ações, entradas e seletores do `DataStoreContract` para integração `frontend-ui` + `backend-core`.
- `src/types/index.ts` — Barrel export unificado dos contratos.

## `src/styles/` (Design System Escuro & Motion)
- `src/styles/tokens.css` — Paleta escura profunda OLED, bordas translúcidas, tipografia, raios, sombras e safe-areas.
- `src/styles/motion.css` — Escala semântica de movimento (`--duration-*`, `--ease-*`, `--distance-*`, `--scale-*`, `--blur-*`) + `prefers-reduced-motion`.
- `src/styles/global.css` — Integração Tailwind CSS v4 (`@theme`), superfícies, bolhas de conversa, `<dialog:modal>` com contenção de scroll e accordion CSS Grid.

## `src/lib/` (Utilitários, Banco Local, Domínio & Abstração de Plataforma)
- `src/lib/uuid.ts` — Geração UUID v4 client-side (`crypto.randomUUID` + fallback RFC 4122).
- `src/lib/timezone.ts` — Cálculos explícitos em `America/Sao_Paulo` (`getLocalDateString`, `getLocalIsoNow`, aritmética calendário `YYYY-MM-DD`, formatação de data).
- `src/lib/supabase.ts` — Cliente Supabase resiliente com fallback local seguro quando `.env` está vazio.
- `src/lib/db/localDb.ts` — Persistência local-first em IndexedDB (`idb`) com fallback em memória para testes, paginação de mensagens (50/50), `outbox_mutations`, `media_uploads` e `media_blobs`.
- `src/lib/db/seedData.ts` — Carga inicial realista única (controlada por flag para nunca recriar itens removidos).
- `src/lib/domain/textUtils.ts` — Normalização de texto e busca insensível a acentos/maiúsculas.
- `src/lib/domain/careEngine.ts` — Motor puro de cuidados (`flexible_days`, `meter` km/horas + histórico, `annual_date` com ano bissexto e alertas de garantia <= 30 dias).
- `src/lib/domain/routineEngine.ts` — Motor enxuto de rotinas da casa (`fixed_weekdays` e `cyclic_days`, histórico limitado a 10).
- `src/lib/domain/localPredictor.ts` — Predição local instantânea O(1) para prints, URLs, km/horas, aguardando retorno e tarefas offline.
- `src/lib/platform/runtime.ts` — Detecção segura de ambiente (`web` vs. `android` nativo Capacitor).
- `src/lib/platform/nativePlugin.ts` — Registro tipado do plugin nativo Capacitor `MeuDiaNative`.
- `src/lib/platform/haptics.ts` — Feedback tátil nativo no Android com fallback silencioso na Web.
- `src/lib/platform/notifications.ts` — Diagnóstico real de permissões Android, agendamento/cancelamento de alarmes exatos locais e fallback silencioso na Web.
- `src/lib/platform/shareTarget.ts` — Barramento de eventos para recebimento do Android Share Target (links e prints).
- `src/lib/platform/media.ts` — Redimensionamento e compressão client-side de fotos/prints para ~150 KB com prévia local imediata.
- `src/lib/platform/index.ts` — Fachada `platformAdapter` consolidada.

## `src/services/` (Serviços de Domínio & Infra)
- `src/services/authService.ts` — Autenticação para 2 contas independentes, perfil, geração e resgate de convite curto de 24h (`MD-XXXXXX`).
- `src/services/mediaService.ts` — Upload para o bucket privado `meu-dia-media` (`personal/` e `shared/`) e acesso exclusivo via Signed URLs com cache.
- `src/services/syncService.ts` — Outbox offline idempotente (`client_mutation_id`), resolução *Last-Write-Wins* por `updated_at` com soft delete anti-zumbi e fila separada de uploads de mídia.
- `src/services/backupService.ts` — Geração do `BackupExportPayload` JSON com todos os dados textuais do usuário.
- `src/services/assistantService.ts` — Orquestração híbrida Edge Function `assistant-ingest` (`local_iso_now` + `timezone`) com fallback resiliente para motor local / fila offline de áudio.
- `src/services/checkinService.ts` — Check-in semanal proativo em `America/Sao_Paulo` para medidores sem leitura há >= 7 dias (respeitando pausas e sem duplicatas).
- `src/services/bridgeService.ts` — Cliente desacoplado das pontes opcionais `bridge-rotinas` e `bridge-passatempos` com degradação graciosa.
- `src/services/pushTokenService.ts` — Registro e renovação do token FCM Android em `device_push_tokens` com fallback silencioso na Web.

## `src/store/` (Estado Global Zustand)
- `src/store/useAuthStore.ts` — Sessão, perfil local/remoto, parceiro vinculado e gerenciamento de convites da Casa.
- `src/store/useUiStore.ts` — Navegação Mobile/PC Split View, horizonte da Agenda, diálogos e sessão do modo `Descansar`.
- `src/store/useDataStore.ts` — Store central local-first das 5 áreas, fila offline, busca global e exportação JSON.

## `src/components/` (Componentes Visuais)
- `src/components/ui/ModalDialog.tsx` — Wrapper acessível para `<dialog>` nativo com `closedby="any"` e fallback light-dismiss.
- `src/components/layout/TopBar.tsx` — Cabeçalho compacto com avatar, seletor Split View no PC, status offline discreto, Busca Global e `Descansar`.
- `src/components/layout/BottomNav.tsx` — Barra inferior mobile com 5 abas no alcance do polegar e pílula animada.
- `src/components/layout/AppShell.tsx` — Casca adaptativa com `React.lazy` (Mobile 1 coluna + Bottom Bar | PC Split View com Conversa fixa à direita).
- `src/components/chat/ChatBubble.tsx` — Bolha da Conversa com prévia de imagem, vínculos vivos (`open|done|removed`), botões de ambiguidade (`needs_clarification`), transcrição editável e menu `Corrigir / Desfazer`.
- `src/components/chat/AudioRecorderButton.tsx` — Gravador `MediaRecorder` leve até 90s com contador `0:00 / 1:30`, barra de progresso e cancelamento/envio.
- `src/components/agenda/TaskModal.tsx` — Modal de criação/edição manual de tarefas (`Agenda`/`Casa`, aguardando retorno e toggle opt-in Modo Ligação).
- `src/components/casa/MuralModal.tsx` — Modal de criação/edição de recados com horário no Mural e toggle opt-in Modo Ligação.
- `src/components/casa/CasaItemModal.tsx` — Modal unificado de tarefa compartilhada avulsa ou rotina recorrente (`fixed_weekdays` / `cyclic_days`).
- `src/components/cuidados/AssetModal.tsx` — Cadastro/edição de ativos, medidor (`km|hours|none`), compra, garantia e upload de nota fiscal.
- `src/components/cuidados/CareRuleModal.tsx` — Criação/edição de regras de cuidado (`flexible_days`, `meter`, `annual_date`).
- `src/components/cuidados/CompleteCareModal.tsx` — Confirmação de serviço realizado com medição real pré-preenchida, oficina/peça e valor.
- `src/components/guardados/VaultItemModal.tsx` — Criação/edição de `Prints` intactos (sem OCR), `Links`, `Estudos` e `Trabalho`.
- `src/components/modals/GlobalSearchDialog.tsx` — Diálogo de busca global unificada (`Ctrl+K` / lupa) navegando direto para a área.
- `src/components/modals/PauseDialog.tsx` — Configuração rápida e timer regressivo `mm:ss` do modo `Descansar` (15 / 20 / 30 min).
- `src/components/settings/NotificationDiagnosticsCard.tsx` — Diagnóstico real em tempo real de notificações, alarmes exatos, tela cheia e bateria com atalhos diretos ao sistema Android e fallback limpo na Web.
- `src/components/settings/SettingsDialog.tsx` — Perfil, fuso `America/Sao_Paulo`, rotina de pausas, Auth 2 contas, pareamento 24h, diagnóstico de notificações, integrações opcionais e Exportação JSON.

## `src/pages/` (Páginas das 5 Áreas)
- `src/pages/ChatPane.tsx` — Painel da `Conversa` cronológica paginada (~50), envio de texto/links/fotos e rastreabilidade viva.
- `src/pages/AgendaPage.tsx` — `Agenda` (`Hoje | Semana | Mês | Depois`), banner discreto de dias anteriores, `Aguardando retorno`, calendário mensal com alertas de garantia e tela de pausa.
- `src/pages/CasaPage.tsx` — `Mural` com horário, `Tarefas e rotinas da casa` (`Tudo | Meu | Dela | Os dois`), conclusão com histórico e lembrete de mercado.
- `src/pages/CuidadosPage.tsx` — Cartões de ativos com divulgação progressiva, atualização rápida de medidor, nota fiscal, regras e histórico técnico.
- `src/pages/GuardadosPage.tsx` — Cofre pessoal filtrado por `Prints`, `Links`, `Estudos` e `Trabalho` com visualização ampliada de prints.

## `supabase/` (Banco de Dados, RLS & Funções)
- `supabase/config.toml` — Configuração local do projeto Supabase `meu-dia`.
- `supabase/migrations/0001_initial_schema.sql` — Schema completo (13 tabelas), triggers de `updated_at`, RPCs seguras de pareamento 24h, cancelamento automático de `notification_jobs`, trava atômica `SKIP LOCKED`, RLS rigoroso e bucket privado `meu-dia-media`.
- `supabase/migrations/0002_phase2_refinements.sql` — Migração de usuário solo ao resgatar convite do parceiro e limpeza automática de `invite_redeem_attempts` (> 24h).
- `supabase/functions/assistant-ingest/modelRotation.ts` — Rotação sequencial de modelos Groq + fallback Gemini (`AbortController` 12s, fallback em 429/5xx/404/timeout/JSON inválido).
- `supabase/functions/assistant-ingest/index.ts` — Edge Function autenticada por JWT com Whisper (descarte imediato de áudio), multi-intenção (`actions[]`), ambiguidade (`needs_clarification`) e fuso explícito `America/Sao_Paulo`.
- `supabase/migrations/0003_phase4_notifications_and_cron.sql` — Triggers server-side (`SECURITY DEFINER`) para enfileiramento automático de `notification_jobs` em `America/Sao_Paulo` (tarefas, mural e garantias 30d antes às 09:00) e configuração `pg_cron`.
- `supabase/deploy_all_migrations.sql` — Script SQL unificado (`0001 + 0002 + 0003`) pronto para execução única no SQL Editor.
- `supabase/optional_cleanup_old_things_tables.sql` — Script opcional para remover tabelas antigas do `Things` após conferência do backup.
- `supabase/functions/dispatch-notifications/index.ts` — Worker de push FCM HTTP v1 autenticado por `CRON_SECRET`/`service_role`, usando `claim_due_notification_jobs`, respeitando pausa ativa para `push` e mantendo `call_alarm` ativo.
- `supabase/functions/bridge-rotinas/index.ts` — Ponte opcional autenticada por JWT atualizando/inserindo `produtos_armario` (`status = 'falta'`, `na_lista_mercado = true`).
- `supabase/functions/bridge-passatempos/index.ts` — Ponte opcional autenticada por JWT consultando `/search` (até 3 candidatos confirmáveis) e gravando exclusivamente em `public.inbox` (nunca sobrescrevendo `user_data`).

## `android/`, `scripts/` & `.github/` (Android Nativo, Build APK & Keep-Alive)
- `android/app/src/main/AndroidManifest.xml` — Permissões (`POST_NOTIFICATIONS`, `SCHEDULE_EXACT_ALARM`, `USE_FULL_SCREEN_INTENT`, `RECEIVE_BOOT_COMPLETED`), Android Share Target (`ACTION_SEND` texto/imagem), `CallAlarmActivity` e receivers.
- `android/app/src/main/java/com/meudia/app/MainActivity.java` — Registro de `MeuDiaNativePlugin`, tratamento de `ACTION_SEND` e `deep_link_message_id`.
- `android/app/src/main/java/com/meudia/app/MeuDiaNativePlugin.java` — Diagnóstico real de permissões/bateria/alarmes/tela cheia, intents do sistema, `AlarmManager.setAlarmClock` e fila de eventos nativos.
- `android/app/src/main/java/com/meudia/app/CallAlarmReceiver.java` — Deduplicação por `job_id` (5 min) e disparo de notificação `FullScreenIntent` no canal `meudia_call_alarm`.
- `android/app/src/main/java/com/meudia/app/CallAlarmActivity.java` — Tela cheia sobre bloqueio com toque/vibração contínuos, botões **Atender** (deep link) e **Adiar 10 min**.
- `android/app/src/main/java/com/meudia/app/NotificationActionReceiver.java` — Ações inline (`Adiar 1h`, `Concluir`, `Adiar 10 min`, `Abrir`).
- `android/app/src/main/java/com/meudia/app/MeuDiaFirebaseMessagingService.java` — Receptor FCM nativo que aciona `CallAlarmReceiver` (Modo Ligação) ou `MeuDiaNativePlugin` (mensagens com ações inline) mesmo com o app fechado.
- `scripts/gerar-apk.ps1` — Script automatizado com sincronização de versão (`package.json` + `build.gradle`), autodetecção de JDK 21 / `ANDROID_HOME`, build Web, `npx cap sync android`, `gradlew.bat assembleDebug` e publicação no Google Drive (`G:\Meu Drive\Programacão\Meu Dia\`) com `log_atualizacoes.txt`.
- `scripts/sync-supabase-secrets.ps1` — Envia com 1 comando os segredos de `supabase/functions/.env` (gitignored) para as Edge Functions do novo projeto Supabase.
- `scripts/deploy-supabase.ps1` — Automatiza `supabase link`, `db push`, upload de segredos e deploy das 4 Edge Functions no projeto Supabase.
- `supabase/functions/.env.example` — Template dos segredos server-side das Edge Functions (`GROQ_API_KEY`, `GEMINI_API_KEY`, `CRON_SECRET`, FCM e pontes).
- `docs/gerar-apk.md` — Protocolo oficial de versionamento, changelog e geração de APK no Google Drive.
- `log_atualizacoes.txt` — Histórico de versões do APK sincronizado com o Google Drive.
- `.github/workflows/supabase-keep-alive.yml` — Workflow diário mantendo o projeto Supabase Free ativo.

## `tests/` (Suíte Automatizada Vitest)
- `tests/setup.ts` — Setup global `@testing-library/jest-dom` e polyfill leve de `HTMLDialogElement` para `jsdom`.
- `tests/phase1/timezone.test.ts` — Testes de fuso `America/Sao_Paulo` e proteção contra virada de dia precoce em UTC.
- `tests/phase1/platform.test.ts` — Testes de fallback silencioso na Web e cálculo/compressão de imagens.
- `tests/phase1/pairing-media.test.ts` — Testes de convite 24h (`MD-XXXXXX`) e paths privados `personal/` vs. `shared/`.
- `tests/phase1/rls-schema.test.ts` — Auditoria automatizada de RLS, isolamento privado/compartilhado, bucket privado, triggers de cancelamento e zero segredos no código cliente.
- `tests/phase1/shell.test.tsx` — Testes de renderização da casca, navegação, modo `Descansar` e ausência de jargões banidos.
- `tests/phase2/care-and-routines.test.ts` — Testes de ciclos `flexible_days`, `meter`, `annual_date` (bissexto), alerta de garantia 30d e rotinas fixas/cíclicas.
- `tests/phase2/sync-and-lww.test.ts` — Testes de fila offline idempotente (`client_mutation_id`), conflito Last-Write-Wins e soft delete anti-zumbi.
- `tests/phase2/store-chat-search-backup.test.ts` — Testes de paginação (~50), predição local O(1), vínculos vivos, `Corrigir / Desfazer`, busca global e exportação JSON.
- `tests/phase2/sql-refinements.test.ts` — Testes de segurança e privilégios da migração `0002_phase2_refinements.sql`.
- `tests/phase3/model-rotation.test.ts` — Testes de rotação de modelos (429/500/404/timeout/JSON inválido/fallback Gemini).
- `tests/phase3/compound-ambiguity-pause.test.ts` — Testes de textos compostos multi-intenção, ambiguidade (`needs_clarification`) e pedidos naturais de pausa em `America/Sao_Paulo`.
- `tests/phase3/audio-and-checkin.test.ts` — Testes de fila offline de áudio com descarte pós-transcrição, edição de ruído de obra e check-in semanal sem duplicata.
- `tests/phase3/security.test.ts` — Auditoria automatizada de JWT obrigatório na Edge Function e zero chaves/segredos no cliente.
- `tests/phase4/notifications-and-platform.test.ts` — Testes de ações de notificação (`snooze_1h`, `snooze_10m`, `complete`, `open`) e fallback Web de diagnóstico/alarme/share target.
- `tests/phase4/bridges.test.ts` — Testes das pontes opcionais desacopladas (`Rotinas de Casa` e `Passatempos` confirmável).
- `tests/phase4/native-and-sql-security.test.ts` — Auditoria automatizada do `AndroidManifest.xml`, plugin nativo, `0003_phase4_notifications_and_cron.sql`, `dispatch-notifications` e Edge Functions de pontes.
