# Plano Mestre de Produto e Arquitetura — **Meu Dia** (v2 Final)

> **Objetivo:** Especificação única, completa, concisa e **sem código** para um agente orquestrador arquitetar e construir o aplicativo **Meu Dia** do zero, com fundação sólida desde a primeira linha.

---

## 1. Visão Geral, Usuários & Anti-Escopo

- **Nome do aplicativo:** **Meu Dia**
- **Plataformas:** Android (Motorola, APK nativo via Capacitor) + Web/PC (responsivo, uso frequente à noite no computador).
- **Usuários & Pareamento:**
  - Suporta **1 usuário sozinho** desde o primeiro acesso e **2 contas reais independentes** (Marido + Esposa) vinculáveis a qualquer momento via **código ou link de convite com expiração de 24h** nas Configurações.
  - Ambos possuem exatamente a mesma interface e funções privadas (Conversa, Agenda, Guardados, Cuidados pessoais), compartilhando explicitamente apenas o que pertencer ao espaço comum (`Casa`, `Mural` e `Cuidados` marcados como compartilhados). Itens compartilhados podem ser editados e concluídos por ambos.
- **Problema central:** eliminar o atrito de anotar na rua/obra, evitar a fragmentação em vários apps, acompanhar manutenções/garantias sem data fixa e impedir o abandono por acúmulo de tarefas atrasadas.

### Anti-Escopo (O que NÃO entra)
- **Não** incluir controle financeiro (já existe app dedicado).
- **Não** incluir rastreador de horas de sono, lembretes de água ou preparo de refeições (já utiliza relógio Huawei e prefere sem esses avisos).
- **Não** absorver a lista de compras de mercado (permanece no `Rotinas de Casa`).
- **Não** absorver o catálogo de filmes/séries/jogos (permanece no `Passatempos`).
- **Não** depender de IA ou servidor local no computador (o PC fica desligado; toda IA e agendamentos rodam na nuvem).

---

## 2. Psicologia Visual, Linguagem & Navegação

- **Linguagem:** português brasileiro natural, calmo, direto e adulto. **Nunca exibir rótulos artificiais ou jargões psicológicos na interface** (evitar termos como *"sem cobrança"*, *"radar"*, *"descarrego"*).
- **Estética:** tema escuro profundo moderno (inspirado no acabamento do `Passatempos`: camadas sutis de superfície, bordas translúcidas finas, cantos arredondados, tipografia limpa como `Sora` + `Inter`, ícones `Lucide`, micro-interações fluidas com `framer-motion` e feedback tátil nativo no Android).
- **Zero "Cemitério Vermelho":** tarefas não feitas de dias anteriores nunca acumulam em vermelho cobrando o usuário; ficam agrupadas em um **banner discreto e recolhível no topo de `Agenda → Hoje`** (*"X itens de dias anteriores • Revisar"*) com ação em 1 toque (*Hoje · Semana · Depois · Arquivar*).
- **Divulgação Progressiva:** cartões mostram título + 1 linha de resumo. Detalhes densos (garantia, nota fiscal, oficina, histórico) ficam recolhidos e expandem apenas ao tocar.
- **Independência da IA:** todas as áreas (`Agenda`, `Casa`, `Cuidados`, `Guardados`) devem oferecer criação (`+`) e edição manual rápidas, funcionando 100% mesmo sem IA ou sem internet.
- **Navegação Adaptativa:**
  - **Celular (Android):** barra inferior fixa com 5 abas no alcance do polegar (`Conversa`, `Agenda`, `Casa`, `Cuidados`, `Guardados`) + cabeçalho compacto com **Busca Global** e botão **Descansar**.
  - **Computador (Web):** **Tela Dividida (Split View)** — painel ativo à esquerda (`Agenda`, `Casa`, `Cuidados` ou `Guardados`) e `Conversa` sempre visível à direita.

---

## 3. Especificação Funcional

### 3.1. Conversa (Chat estilo WhatsApp)
- Histórico cronológico contínuo com paginação (carrega as ~50 mensagens mais recentes e pagina ao subir).
- **Entradas:** texto livre, links, prints/fotos (comprimidos no aparelho para ~150 KB antes do envio) e áudios curtos (limite ~90s em formato leve, transcritos na nuvem com texto editável para corrigir ruído de obra; o arquivo de áudio é descartado após transcrição bem-sucedida, sendo mantido em blob local apenas enquanto aguarda na fila offline).
- **Multi-intenção & Ambiguidade:**
  - Uma única mensagem/áudio pode gerar múltiplas ações estruturadas (`actions[]`), ex: atualizar km + mandar item pro mercado + criar recado no Mural.
  - Em caso de ambiguidade (ex: *"moto 34.500"* existindo duas motos, ou *"limpar filtro"*), a IA retorna estado `needs_clarification` com botões rápidos de escolha dentro da bolha, sem chutar.
- **Rastreabilidade & Correção:** respostas automáticas exibem link para o item vinculado (refletindo seu estado atual — aberto, concluído ou removido — sem links quebrados) e botão discreto **"Corrigir destino / Desfazer"**.
- **Check-ins ativos & Pausas naturais:** envio periódico proativo de perguntas no chat (ex: km semanal das motos) e interpretação de pedidos flexíveis de descanso (ex: *"quero 4 dias de pausa essa semana às 21h"*).

### 3.2. Agenda (Horizonte Temporal)
- Seletor em pílula: **`Hoje` | `Semana` | `Mês` | `Depois`**.
  - **Hoje:** banner recolhível de dias anteriores (quando existir) + tarefas do dia + bloco discreto **`Aguardando retorno`** (ex: orçamento de mecânico, entrega, cliente, com lembrete suave após X dias).
  - **Semana:** próximos 7 dias com visualização clara do fim de semana.
  - **Mês:** calendário mensal limpo (pontos discretos nos dias com evento) + lista de compromissos futuros, vencimentos anuais e vencimentos de garantias.
  - **Depois:** itens sem data fixa.
- **Pausas:** suporta tanto rotina fixa (ex: desacelerar à noite) quanto pausas avulsas na semana. O modo **Descansar** oculta todas as tarefas e oferece um timer opcional simples (15 / 20 / 30 min) que silencia avisos não críticos durante o descanso.

### 3.3. Casa (Espaço Compartilhado)
- **Mural com Horário:** recados direcionados entre o casal com disparo de push exato no celular do destinatário (mesmo com app fechado).
- **Tarefas & Rotinas da Casa:** filtro rápido (`Tudo` | `Meu` | `Dela` | `Os dois`), suportando tarefas avulsas e rotinas recorrentes (modo fixo por dias da semana ou cíclico a cada N dias, para migração manual do `Rotinas de Casa`).
- **Modelagem enxuta de recorrência:** cada rotina guarda apenas a **regra + a próxima ocorrência ativa** (ao concluir, registra histórico e calcula a próxima, sem gerar centenas de linhas futuras no banco).
- **Mercado:** atalho informativo lembrando que a lista de compras vive no `Rotinas de Casa` (com envio rápido opcional pelo chat).

### 3.4. Cuidados (Ativos, Manutenções & Garantias)
- Estrutura genérica de **Ativos** (privados ou compartilhados): sua moto, moto da esposa, ar-condicionado, carro, ferramentas, quintal/casa.
- **Gatilhos suportados:**
  1. **Dias flexíveis:** reinicia sempre a partir da data real de conclusão (ex: cortar grama ~15 dias; limpar filtro do ar ~60 dias).
  2. **Medidor (`km` ou `horas`):** ao concluir um serviço (ex: troca de óleo), solicita confirmação da medição real (pré-preenchida com a atual) + nota opcional de oficina/peça/valor, recalculando o próximo marco a partir desse valor real.
  3. **Data anual:** renovações e revisões anuais (CNH, licenciamento das motos, limpeza técnica anual).
- **Garantia & Memória Técnica:** data da compra, prazo/validade da garantia, foto da nota fiscal em anexo, histórico resumido de oficinas/peças e **lembrete automático suave 30 dias antes do vencimento da garantia**.

### 3.5. Guardados
- Categorias diretas: `Prints`, `Links`, `Estudos` e `Trabalho`.
- Prints são salvos intactos, sem forçar OCR/processamento automático invasivo.

### 3.6. Recursos Transversais
- **Busca Global (Lupa):** busca unificada em `Conversa`, `Agenda`, `Casa`, `Cuidados` e `Guardados`.
- **Android Share Target:** receber links (YouTube/Chrome) e imagens/prints (Galeria) diretamente do menu nativo "Compartilhar" do Android.
- **Exportação / Backup:** geração sob demanda de arquivo JSON com dados textuais do usuário.

---

## 4. Notificações Push & Alarme "Modo Ligação"

1. **Notificações Push Estilo Mensagem (Padrão):**
   - Permitidas a qualquer horário (inclusive durante o trabalho na obra, para consulta depois).
   - Chegam com redação natural de mensagem (do assistente ou do Mural).
   - **Deep Link:** tocar na notificação abre diretamente a aba `Conversa` na mensagem correspondente, com atalho para o item vinculado.
   - **Ações rápidas na notificação Android:** botões inline para *Adiar 1h* ou *Concluir* sem precisar abrir o app.
2. **Alarme "Modo Ligação" (Estritamente Opt-in por Item Crítico):**
   - **Regra de UX:** desligado por padrão; ativável manualmente via toggle *"Tocar como ligação"* apenas em compromissos críticos ou recados urgentes.
   - **Redundância Offline + Remota no Android:**
     - Para compromissos pessoais com `alarm_call_mode = true`, agendar **também um alarme exato local (`AlarmManager`)** no aparelho como garantia caso o celular esteja offline na hora (deduplicado por `job_id` caso o push também chegue).
     - Para recados urgentes vindos do outro aparelho (Mural), usar FCM prioridade alta acordando o serviço nativo Capacitor com `FullScreenIntent` (`USE_FULL_SCREEN_INTENT` + `SCHEDULE_EXACT_ALARM`) e toque contínuo até **Atender (abrir lembrete)** ou **Adiar 10 min**.
3. **Confiabilidade de Disparo & Cancelamento:**
   - Todo `notification_job` é **cancelado ou reagendado automaticamente** se a tarefa/mural for concluída, adiada ou excluída antes do horário.
   - Processamento no servidor (`pg_cron` + Edge Function) com trava atômica (`pending → processing → sent/failed`) garantindo entrega única (idempotente) e limpeza automática de jobs com mais de 30 dias.
4. **Tela de Diagnóstico de Notificações (Configurações):**
   - Verifica em tempo real no Android: permissão de notificações, otimização de bateria, alarmes exatos e exibição em tela cheia, oferecendo atalho direto para ajustar no sistema.

---

## 5. Arquitetura Técnica, Dados, Offline & Segurança

### 5.1. Backend & Fuso Horário
- **Projeto Supabase novo e exclusivo** (isolado de `Rotinas de Casa` e `Passatempos`).
- **Fuso horário explícito:** salvar `timezone` em `profiles` (padrão `America/Sao_Paulo`); enviar `local_iso_now` + `timezone` em toda chamada à IA e usar o fuso do perfil no `pg_cron` para cálculos de "Hoje", check-ins, pausas e horários do Mural.
- **Saúde no Supabase Free:** incluir workflow leve de `keep-alive` (evitando pausa por inatividade de 7 dias).

### 5.2. Entidades Conceituais (com RLS rigoroso)
Todas as tabelas sincronizáveis incluem `id` (UUID v4 gerado no cliente), `updated_at` e `deleted_at` (soft delete):
- `households` e `household_invites` (convites com código curto e expiração de 24h).
- `profiles` (conta, vínculo opcional com `household_id`, `timezone`, preferências de pausas).
- `device_push_tokens` (tokens FCM por aparelho/usuário).
- `chat_messages` (histórico, autor, tipo, texto, `media_path`, `actions_payload`, status de vínculo).
- `tasks` (pessoais/compartilhadas, `horizon`: `today|week|month|later`, `status`: `open|waiting|done|archived`, `assigned_to`, `due_date`, `due_time`, `waiting_remind_at`, `alarm_call_mode`).
- `house_routines` (regras de rotinas fixas/cíclicas da casa + próxima ocorrência ativa + log resumido de conclusões).
- `mural_notes` (autor, destinatário, mensagem, `notify_at`, `alarm_call_mode`, status).
- `assets` e `care_rules` (bens, medidor atual, compra/garantia, `receipt_path`, regras por dias/medidor/data anual, histórico de serviços/peças).
- `vault_items` (`print|link|study|work`, título, URL, texto, `media_path`).
- `notification_jobs` (fila agendada com status atômico, `delivery_mode`: `push|call_alarm`, `deep_link_message_id` e referência ao item para cancelamento automático).

### 5.3. Offline-First & Sincronização Segura
- Fila offline persistida em **IndexedDB** com chave de idempotência (`client_mutation_id`) para impedir duplicações quando o 4G oscilar na obra.
- Resolução de conflitos via *Last-Write-Wins* por `updated_at` + soft delete (`deleted_at`) evitando "itens zumbis".
- Upload de imagens/notas em fila separada: o item aparece imediatamente na UI com prévia local e sincroniza o arquivo assim que houver conexão.
- **Predição local instantânea O(1):** padrões óbvios (URLs, atualizações diretas de `km`, comandos curtos) são reconhecidos localmente na hora mesmo offline.

### 5.4. Segurança & IA na Nuvem
- **Storage Privado:** todas as fotos, prints e notas fiscais residem em **bucket privado** protegido por `RLS` (`owner_id` / `household_id`), acessados exclusivamente por **Signed URLs** com cache local.
- **Segredos apenas no servidor:** chaves de provedores de IA (Gemini/Groq) e eventuais credenciais de pontes externas ficam **exclusivamente nos Secrets das Edge Functions**, nunca no frontend ou APK.
- **Edge Function `assistant-ingest`:** transcrição + classificação em `actions[]` com **rotação automática de modelos e fallback** em `429` / `500+`.

### 5.5. Pontes Opcionais e Desacopladas (Sem Vínculo Obrigatório)
Previstas na arquitetura, ativáveis via Edge Functions autenticadas sem acoplar o núcleo:
- **`Rotinas de Casa`:** atualiza/insere item em `produtos_armario` (`status = 'falta'`, `na_lista_mercado = true`).
- **`Passatempos`:** consulta `/search` para exibir 2–3 opções confirmáveis dentro da bolha do chat (evitando vínculo errado) e grava o escolhido em uma tabela de fila (`inbox`) no Supabase do `Passatempos`, **sem sobrescrever diretamente** o JSON local-first `user_data.payload`.

---

## 6. Stack, Fronteira de Plataforma & Fases de Execução

- **Stack:** React 19 + TypeScript + Vite + Tailwind CSS v4 + Framer Motion + Lucide React + TanStack Query + Zustand + Capacitor (Android) + Vitest.
- **Camada de Plataforma:** isolar plugins nativos Capacitor (`Share Target`, `FCM`, `AlarmManager/FullScreenIntent`, `Haptics`) atrás de serviços de plataforma com fallback silencioso na Web, garantindo que a versão PC funcione sem erros.
- **Governança:** manter `docs/mapa-arquitetura.md` atualizado a cada módulo criado e incluir script automatizado `scripts/gerar-apk.ps1`.

### Fases & Critérios de Pronto (Definition of Done)

1. **Fase 1 — Fundação, Auth, Pareamento & Design System**
   - *Escopo:* setup do repositório, Design System escuro moderno, abstração de plataforma Web/Android, Auth para 2 contas + convite de `household_id`, schema Supabase completo com `RLS`, bucket privado com compressão de imagem e `docs/mapa-arquitetura.md`.
   - *Pronto quando:* `typecheck`, `lint`, testes de regras base e políticas `RLS` (isolamento privado vs. compartilhado) estiverem validados sem erros.

2. **Fase 2 — As 5 Áreas, Split View & Offline-First**
   - *Escopo:* navegação adaptativa (Bottom Bar mobile + Split View PC), `Conversa` paginada, `Agenda` (`Hoje` com banner de dias anteriores + `Aguardando`, `Semana`, `Mês`, `Depois` + Pausas/Descansar), `Casa` (`Mural` + `Tarefas/Rotinas`), `Cuidados` (`Ativos`, medidores, ciclos flexíveis e garantias com aviso de 30 dias), `Guardados`, Busca Global, criação manual (`+`) em todas as abas, fila offline com idempotência + soft delete e Exportação JSON.
   - *Pronto quando:* todo o app funcionar ponta a ponta com e sem internet (sem depender de IA), com testes unitários cobrindo cálculos de ciclos, medidores, recorrências e sincronização offline.

3. **Fase 3 — IA na Nuvem, Check-ins & Áudio**
   - *Escopo:* Edge Function `assistant-ingest` (fuso horário explícito, `actions[]`, `needs_clarification`, rotação de modelos com fallback, transcrição com descarte de áudio), predição local O(1), botão "Corrigir destino / Desfazer", check-in semanal ativo e pedidos naturais de pausa.
   - *Pronto quando:* áudios, textos compostos e ambíguos forem resolvidos corretamente respeitando `America/Sao_Paulo`, sem nenhuma chave sensível exposta no cliente.

4. **Fase 4 — Android Nativo, Push, Modo Ligação & Pontes Opcionais**
   - *Escopo:* build APK Capacitor (`gerar-apk.ps1`), Android Share Target, `pg_cron` + FCM com trava atômica, cancelamento automático de jobs, ações rápidas na notificação, deep link direto na mensagem da `Conversa`, tela de Diagnóstico de Notificações, plugin nativo de `FullScreenIntent` + redundância local `AlarmManager` para `alarm_call_mode`, workflow `keep-alive` e pontes opcionais para `Rotinas de Casa` e `Passatempos`.
   - *Pronto quando:* APK instalar e rodar no Android com push real entre 2 aparelhos, deep link validado, modo ligação testado com e sem internet, e versão PC continuar intacta.
