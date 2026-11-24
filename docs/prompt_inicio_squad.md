# Prompt Pronto — Iniciar o **Meu Dia** (com Squad Integrada)

Abra `C:\Users\Admin\Documents\projetos\Meu Dia` como workspace em uma nova conversa, selecione **`Gemini 4 Neon (High)`**, digite **`/teamwork`** (ou `/swarm`, conforme aparecer no menu) e cole o prompt abaixo:

---

```text
Vamos arquitetar e construir do zero o aplicativo **Meu Dia** neste diretório, com base sólida desde a primeira linha (sem atalhos de MVP fraco).

### 1. Fontes obrigatórias (leia antes de criar qualquer arquivo)
- `docs/plano_mestre_meu_dia.md` (especificação v2 completa: produto, UX, dados, offline, IA na nuvem, notificações, Modo Ligação e fases)
- `docs/prototipo_v4.html` (referência estrutural de layout/navegação — evolua o acabamento para tema escuro moderno de nível nativo, sem copiar HTML estático)

### 2. Referências locais somente leitura (NUNCA modificar)
- `C:\Users\Admin\Documents\projetos\Passatempos` (tokens escuros `src/styles/tokens.css`, Framer Motion, Capacitor, Edge Function)
- `C:\Users\Admin\Documents\projetos\Minhas Finanças` (`docs/mapa-arquitetura.md`, rotação de modelos em `src/services/groqService.ts`, diagnóstico Android e `scripts/gerar-apk.ps1`)
- `C:\Users\Admin\Documents\projetos\Rotinas de Casa` (apenas referência para a ponte opcional com `produtos_armario` e `supabase-keep-alive.yml`)
Não acesse nem altere nenhum outro projeto da pasta `projetos`.

### 3. Squad Especializada para esta execução
Configure e opere exatamente esta equipe enxuta (5 papéis), respeitando modelos, `workspace` e fronteiras de pastas para evitar conflitos:
- **Coordinator (Plan → Build):** comece em `Gemini 4 Neon (High)` para planejar e travar contratos; ao iniciar o build, troque via `swarm model` para `Gemini 4 Carbon (High)`.
- **`scout`** (`Gemini 4 Hydrogen (High)`, `workspace: "inherit"`): temporário, apenas no início da Fase 1 — lê os 3 projetos de referência (somente leitura) e entrega resumo curto dos padrões de tema escuro, rotação de IA, diagnóstico Android e build APK. Encerrar assim que entregar.
- **`frontend-ui`** (`Claude Sonnet 5.5 (High)`, `workspace: "share"`): entra a partir da Fase 2. Dono exclusivo de `src/components/**`, `src/pages/**`, `src/styles/**`, `index.html`. Deve usar as skills `modern-web-guidance`, `transitions-dev` e `transitions-polish`.
- **`backend-core`** (`Gemini 4 Hydrogen (High)`, `workspace: "share"`): entra a partir da Fase 2. Dono exclusivo de `supabase/**`, `src/services/**`, `src/lib/**`, `src/store/**`, `android/**`, `scripts/**`.
- **`reviewer`** (`Claude Opus 5.5 (Medium)`, `workspace: "inherit"`): poder de veto ao fim de cada fase — audita (1) visual real rodando no navegador em Mobile e PC (zero poluição, linguagem natural sem jargões artificiais, zero "cemitério vermelho") e (2) segurança (`RLS`, bucket privado com Signed URLs, segredos só em Edge Functions, fuso `America/Sao_Paulo`, cancelamento automático de `notification_jobs`).
- **`verifier`** (`Gemini 4 Hydrogen (Low)`, `workspace: "inherit"`): roda `typecheck`, `lint`, `vitest run` e `vite build` a cada entrega.

### 4. Como começar agora
1. Ative o `scout` para extrair os padrões de referência e encerre-o ao concluir.
2. Apresente para minha aprovação o plano técnico da **Fase 1** (estrutura de pastas, Design System escuro, contratos `src/types/*`, abstração Web vs. Capacitor e schema SQL + RLS do novo Supabase) + `docs/mapa-arquitetura.md`.
3. Só após minha aprovação, troque o coordenador para `Gemini 4 Carbon (High)` e execute fase por fase cumprindo todos os Critérios de Pronto de `docs/plano_mestre_meu_dia.md` (validando visual da casca no fim da Fase 1 antes de paralelizar `frontend-ui` e `backend-core` na Fase 2).

Só me interrompa se precisar de credenciais externas (URL/keys do novo Supabase ou chaves de IA); avance tudo o que for independente localmente.
```
