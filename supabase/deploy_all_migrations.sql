-- Meu Dia: Script SQL Unificado (0001 + 0002 + 0003)
-- Seguro para colar de uma vez no SQL Editor do Supabase.

-- =============================================================================
-- Meu Dia — Schema Inicial Completo, Políticas RLS, Triggers e Bucket Privado
-- Projeto Supabase exclusivo e isolado. Fuso padrão: America/Sao_Paulo.
-- =============================================================================

create extension if not exists pgcrypto;

-- -----------------------------------------------------------------------------
-- 1. Tabelas Nucleares de Conta e Pareamento (1 usuário solo ou 2 contas reais)
-- -----------------------------------------------------------------------------

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null default 'Nossa Casa',
  created_by uuid not null references auth.users(id) on delete cascade,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default 'Você',
  avatar_initial text not null default 'V',
  household_id uuid references public.households(id) on delete set null,
  timezone text not null default 'America/Sao_Paulo',
  pause_preferences jsonb not null default '{"weekdays":[2,4,6],"start_time":"21:30","default_duration_minutes":20,"mute_non_critical":true}'::jsonb,
  active_pause_until timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_profiles_household_id on public.profiles(household_id)
  where household_id is not null;

create table if not exists public.household_invites (
  id uuid primary key default gen_random_uuid(),
  household_id uuid not null references public.households(id) on delete cascade,
  code text not null unique,
  created_by uuid not null references public.profiles(id) on delete cascade,
  expires_at timestamptz not null default (now() + interval '24 hours'),
  used_by uuid references public.profiles(id) on delete set null,
  used_at timestamptz,
  created_at timestamptz not null default now(),
  constraint chk_household_invites_code_format check (code ~ '^MD-[A-Z0-9]{6}$')
);

create index if not exists idx_household_invites_code on public.household_invites(code);

create table if not exists public.invite_redeem_attempts (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  attempted_at timestamptz not null default now()
);

create index if not exists idx_invite_redeem_attempts_user_time
  on public.invite_redeem_attempts(user_id, attempted_at desc);

create table if not exists public.device_push_tokens (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  platform text not null check (platform in ('android', 'web')),
  token text not null,
  device_label text,
  last_seen_at timestamptz not null default now(),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (user_id, token)
);

-- -----------------------------------------------------------------------------
-- 2. Entidades Sincronizáveis (Offline-First com UUID v4, updated_at, deleted_at)
-- -----------------------------------------------------------------------------

create table if not exists public.chat_messages (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  sender text not null check (sender in ('user', 'assistant', 'system')),
  message_type text not null default 'text'
    check (message_type in ('text', 'image', 'audio_transcript', 'link', 'checkin', 'mural_alert')),
  body text not null default '',
  transcript_editable boolean not null default false,
  media_path text,
  actions_payload jsonb not null default '[]'::jsonb,
  clarification_payload jsonb,
  linked_entities jsonb not null default '[]'::jsonb,
  client_mutation_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_chat_messages_user_created
  on public.chat_messages(user_id, created_at desc)
  where deleted_at is null;

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  scope text not null default 'personal' check (scope in ('personal', 'shared')),
  title text not null,
  notes text,
  horizon text not null default 'today' check (horizon in ('today', 'week', 'month', 'later')),
  status text not null default 'open' check (status in ('open', 'waiting', 'done', 'archived')),
  assigned_to text check (assigned_to in ('me', 'partner', 'both')),
  assigned_user_id uuid references public.profiles(id) on delete set null,
  due_date date,
  due_time time,
  waiting_remind_at timestamptz,
  alarm_call_mode boolean not null default false,
  completed_at timestamptz,
  source_message_id uuid references public.chat_messages(id) on delete set null,
  client_mutation_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chk_tasks_scope_isolation check (
    (scope = 'personal' and household_id is null) or
    (scope = 'shared' and household_id is not null)
  )
);

create index if not exists idx_tasks_owner_horizon
  on public.tasks(owner_id, horizon, status)
  where deleted_at is null;

create index if not exists idx_tasks_household_status
  on public.tasks(household_id, status)
  where household_id is not null and deleted_at is null;

create table if not exists public.house_routines (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  household_id uuid references public.households(id) on delete cascade,
  created_by uuid not null references public.profiles(id) on delete cascade,
  title text not null,
  mode text not null check (mode in ('fixed_weekdays', 'cyclic_days')),
  weekdays smallint[],
  cycle_days integer check (cycle_days is null or cycle_days > 0),
  assigned_to text not null default 'both' check (assigned_to in ('me', 'partner', 'both')),
  assigned_user_id uuid references public.profiles(id) on delete set null,
  next_due_date date not null,
  last_completed_at timestamptz,
  recent_completions jsonb not null default '[]'::jsonb,
  client_mutation_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chk_house_routines_mode_config check (
    (mode = 'fixed_weekdays' and weekdays is not null and cardinality(weekdays) > 0) or
    (mode = 'cyclic_days' and cycle_days is not null and cycle_days > 0)
  )
);

create index if not exists idx_house_routines_household_due
  on public.house_routines(household_id, next_due_date)
  where deleted_at is null;

create table if not exists public.mural_notes (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  household_id uuid references public.households(id) on delete cascade,
  author_id uuid not null references public.profiles(id) on delete cascade,
  recipient_id uuid references public.profiles(id) on delete set null,
  body text not null,
  notify_at timestamptz,
  alarm_call_mode boolean not null default false,
  status text not null default 'scheduled'
    check (status in ('scheduled', 'sent', 'acknowledged', 'dismissed')),
  source_message_id uuid references public.chat_messages(id) on delete set null,
  client_mutation_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_mural_notes_household_notify
  on public.mural_notes(household_id, notify_at)
  where deleted_at is null;

create table if not exists public.assets (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  scope text not null default 'personal' check (scope in ('personal', 'shared')),
  name text not null,
  category text not null default 'other'
    check (category in ('vehicle', 'appliance', 'tool', 'yard', 'document', 'other')),
  meter_unit text not null default 'none' check (meter_unit in ('km', 'hours', 'none')),
  current_meter numeric(12, 1),
  meter_updated_at timestamptz,
  purchased_at date,
  warranty_expires_at date,
  receipt_path text,
  notes text,
  client_mutation_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chk_assets_scope_isolation check (
    (scope = 'personal' and household_id is null) or
    (scope = 'shared' and household_id is not null)
  )
);

create index if not exists idx_assets_owner_scope
  on public.assets(owner_id, scope)
  where deleted_at is null;

create index if not exists idx_assets_household
  on public.assets(household_id)
  where household_id is not null and deleted_at is null;

create table if not exists public.care_rules (
  id uuid primary key default gen_random_uuid(),
  asset_id uuid not null references public.assets(id) on delete cascade,
  owner_id uuid not null references public.profiles(id) on delete cascade,
  household_id uuid references public.households(id) on delete set null,
  scope text not null default 'personal' check (scope in ('personal', 'shared')),
  title text not null,
  trigger_type text not null check (trigger_type in ('flexible_days', 'meter', 'annual_date')),
  interval_days integer check (interval_days is null or interval_days > 0),
  interval_meter numeric(12, 1) check (interval_meter is null or interval_meter > 0),
  annual_month smallint check (annual_month is null or (annual_month between 1 and 12)),
  annual_day smallint check (annual_day is null or (annual_day between 1 and 31)),
  last_done_at timestamptz,
  last_done_meter numeric(12, 1),
  next_due_date date,
  next_due_meter numeric(12, 1),
  service_history jsonb not null default '[]'::jsonb,
  client_mutation_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz,
  constraint chk_care_rules_scope_isolation check (
    (scope = 'personal' and household_id is null) or
    (scope = 'shared' and household_id is not null)
  )
);

create index if not exists idx_care_rules_asset on public.care_rules(asset_id)
  where deleted_at is null;

create table if not exists public.vault_items (
  id uuid primary key default gen_random_uuid(),
  owner_id uuid not null references public.profiles(id) on delete cascade,
  category text not null check (category in ('print', 'link', 'study', 'work')),
  title text not null,
  url text,
  body text,
  media_path text,
  source_message_id uuid references public.chat_messages(id) on delete set null,
  client_mutation_id uuid unique,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  deleted_at timestamptz
);

create index if not exists idx_vault_items_owner_cat
  on public.vault_items(owner_id, category, created_at desc)
  where deleted_at is null;

-- -----------------------------------------------------------------------------
-- 3. Fila de Notificações e Alarme "Modo Ligação" (Idempotente + Trava Atômica)
-- -----------------------------------------------------------------------------

create table if not exists public.notification_jobs (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references public.profiles(id) on delete cascade,
  household_id uuid references public.households(id) on delete cascade,
  entity_type text not null
    check (entity_type in ('task', 'mural_note', 'care_rule', 'warranty', 'checkin', 'pause')),
  entity_id uuid not null,
  delivery_mode text not null default 'push' check (delivery_mode in ('push', 'call_alarm')),
  title text not null,
  body text not null,
  scheduled_for timestamptz not null,
  status text not null default 'pending'
    check (status in ('pending', 'processing', 'sent', 'failed', 'cancelled')),
  locked_at timestamptz,
  attempt_count smallint not null default 0,
  last_error text,
  deep_link_message_id uuid references public.chat_messages(id) on delete set null,
  sent_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create index if not exists idx_notification_jobs_due_pending
  on public.notification_jobs(scheduled_for asc)
  where status = 'pending';

create index if not exists idx_notification_jobs_entity
  on public.notification_jobs(entity_type, entity_id)
  where status = 'pending';

-- -----------------------------------------------------------------------------
-- 4. Funções Auxiliares, Triggers de updated_at, Auth, Pareamento e Cancelamento
-- -----------------------------------------------------------------------------

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at := greatest(now(), coalesce(old.updated_at, now()));
  return new;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'households',
    'profiles',
    'device_push_tokens',
    'chat_messages',
    'tasks',
    'house_routines',
    'mural_notes',
    'assets',
    'care_rules',
    'vault_items',
    'notification_jobs'
  ]
  loop
    execute format('drop trigger if exists trg_%I_updated_at on public.%I;', tbl, tbl);
    execute format(
      'create trigger trg_%I_updated_at before update on public.%I for each row execute function public.touch_updated_at();',
      tbl,
      tbl
    );
  end loop;
end;
$$;

-- Impede alteração de owner_id após criação (evita sequestro de item compartilhado)
create or replace function public.prevent_owner_id_mutation()
returns trigger
language plpgsql
as $$
begin
  if new.owner_id is distinct from old.owner_id then
    raise exception 'Não é permitido alterar o criador original (owner_id) do item.';
  end if;
  return new;
end;
$$;

do $$
declare
  tbl text;
begin
  foreach tbl in array array[
    'tasks',
    'house_routines',
    'mural_notes',
    'assets',
    'care_rules',
    'vault_items'
  ]
  loop
    execute format('drop trigger if exists trg_%I_prevent_owner_change on public.%I;', tbl, tbl);
    execute format(
      'create trigger trg_%I_prevent_owner_change before update on public.%I for each row execute function public.prevent_owner_id_mutation();',
      tbl,
      tbl
    );
  end loop;
end;
$$;

-- Cria perfil automaticamente com America/Sao_Paulo quando novo usuário registra
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text;
begin
  v_name := coalesce(nullif(trim(new.raw_user_meta_data->>'display_name'), ''), 'Você');
  insert into public.profiles (id, display_name, avatar_initial, timezone)
  values (
    new.id,
    v_name,
    upper(left(v_name, 1)),
    coalesce(nullif(trim(new.raw_user_meta_data->>'timezone'), ''), 'America/Sao_Paulo')
  )
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_auth_user();

-- Função sem recursão de RLS para recuperar o household_id do usuário autenticado
create or replace function public.current_household_id()
returns uuid
language sql
stable
security definer
set search_path = public
as $$
  select household_id
  from public.profiles
  where id = auth.uid();
$$;

revoke all on function public.current_household_id() from public, anon;
grant execute on function public.current_household_id() to authenticated;

-- RPC segura para gerar convite curto de 24h (criando household sob demanda se solo)
create or replace function public.create_household_invite()
returns public.household_invites
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_household_id uuid;
  v_code text;
  v_alphabet constant text := 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  v_invite public.household_invites;
  i int;
begin
  if v_uid is null then
    raise exception 'Usuário não autenticado.';
  end if;

  select household_id into v_household_id
  from public.profiles
  where id = v_uid
  for update;

  if v_household_id is null then
    insert into public.households (name, created_by)
    values ('Nossa Casa', v_uid)
    returning id into v_household_id;

    update public.profiles
    set household_id = v_household_id, updated_at = now()
    where id = v_uid;

    -- Vincula rotinas e recados criados quando estava solo
    update public.house_routines
    set household_id = v_household_id, updated_at = now()
    where owner_id = v_uid and household_id is null;

    update public.mural_notes
    set household_id = v_household_id, updated_at = now()
    where owner_id = v_uid and household_id is null;
  end if;

  loop
    v_code := 'MD-';
    for i in 1..6 loop
      v_code := v_code || substr(v_alphabet, 1 + floor(random() * length(v_alphabet))::int, 1);
    end loop;
    exit when not exists (select 1 from public.household_invites where code = v_code);
  end loop;

  insert into public.household_invites (household_id, code, created_by, expires_at)
  values (v_household_id, v_code, v_uid, now() + interval '24 hours')
  returning * into v_invite;

  return v_invite;
end;
$$;

revoke all on function public.create_household_invite() from public, anon;
grant execute on function public.create_household_invite() to authenticated;

-- RPC segura para resgatar convite de 24h (trava em households, teto de 2 contas e rate-limit persistente)
create or replace function public.redeem_household_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_clean_code text := upper(trim(p_code));
  v_caller_household uuid;
  v_recent_attempts int;
  v_invite public.household_invites;
  v_member_count int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Usuário não autenticado.');
  end if;

  -- Rate-limit persistente: máx. 8 tentativas a cada 15 minutos por usuário
  select count(*) into v_recent_attempts
  from public.invite_redeem_attempts
  where user_id = v_uid
    and attempted_at > now() - interval '15 minutes';

  if v_recent_attempts >= 8 then
    return jsonb_build_object('ok', false, 'error', 'Muitas tentativas. Aguarde 15 minutos.');
  end if;

  -- Trava o perfil do chamador e impede troca se já estiver pareado
  select household_id into v_caller_household
  from public.profiles
  where id = v_uid
  for update;

  if v_caller_household is not null then
    return jsonb_build_object('ok', false, 'error', 'Sua conta já participa de um espaço compartilhado.');
  end if;

  select * into v_invite
  from public.household_invites
  where code = v_clean_code
  for update;

  if not found then
    insert into public.invite_redeem_attempts (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'error', 'Código de convite não encontrado.');
  end if;

  if v_invite.used_at is not null then
    insert into public.invite_redeem_attempts (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'error', 'Este convite já foi utilizado.');
  end if;

  if v_invite.expires_at <= now() then
    insert into public.invite_redeem_attempts (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'error', 'Este convite expirou (validade de 24 horas).');
  end if;

  if v_invite.created_by = v_uid then
    return jsonb_build_object('ok', false, 'error', 'Use este código na segunda conta para parear.');
  end if;

  -- Trava a linha do household ANTES da contagem para impedir corrida de 2 convites simultâneos
  perform 1
  from public.households
  where id = v_invite.household_id
  for update;

  select count(*) into v_member_count
  from public.profiles
  where household_id = v_invite.household_id;

  if v_member_count >= 2 then
    return jsonb_build_object('ok', false, 'error', 'Este espaço compartilhado já possui 2 contas vinculadas.');
  end if;

  update public.profiles
  set household_id = v_invite.household_id, updated_at = now()
  where id = v_uid;

  update public.house_routines
  set household_id = v_invite.household_id, updated_at = now()
  where owner_id = v_uid and household_id is null;

  update public.mural_notes
  set household_id = v_invite.household_id, updated_at = now()
  where owner_id = v_uid and household_id is null;

  update public.household_invites
  set used_by = v_uid, used_at = now()
  where id = v_invite.id;

  return jsonb_build_object('ok', true, 'household_id', v_invite.household_id);
end;
$$;

revoke all on function public.redeem_household_invite(text) from public, anon;
grant execute on function public.redeem_household_invite(text) to authenticated;

-- Cancelamento automático de notification_jobs em UPDATE e DELETE (tasks, mural, care_rules e assets)
create or replace function public.cancel_stale_task_notification_jobs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.notification_jobs
    set status = 'cancelled', updated_at = now()
    where entity_type = 'task'
      and entity_id = old.id
      and status = 'pending';
    return old;
  end if;

  if new.deleted_at is not null
     or new.status in ('done', 'archived')
     or new.due_date is distinct from old.due_date
     or new.due_time is distinct from old.due_time
     or new.waiting_remind_at is distinct from old.waiting_remind_at
     or (old.alarm_call_mode = true and new.alarm_call_mode = false)
  then
    update public.notification_jobs
    set status = 'cancelled', updated_at = now()
    where entity_type = 'task'
      and entity_id = new.id
      and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_tasks_cancel_notification_jobs on public.tasks;
create trigger trg_tasks_cancel_notification_jobs
  after update or delete on public.tasks
  for each row execute function public.cancel_stale_task_notification_jobs();

create or replace function public.cancel_stale_mural_notification_jobs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.notification_jobs
    set status = 'cancelled', updated_at = now()
    where entity_type = 'mural_note'
      and entity_id = old.id
      and status = 'pending';
    return old;
  end if;

  if new.deleted_at is not null
     or new.status in ('acknowledged', 'dismissed')
     or new.notify_at is distinct from old.notify_at
     or (old.alarm_call_mode = true and new.alarm_call_mode = false)
  then
    update public.notification_jobs
    set status = 'cancelled', updated_at = now()
    where entity_type = 'mural_note'
      and entity_id = new.id
      and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_mural_cancel_notification_jobs on public.mural_notes;
create trigger trg_mural_cancel_notification_jobs
  after update or delete on public.mural_notes
  for each row execute function public.cancel_stale_mural_notification_jobs();

create or replace function public.cancel_stale_care_notification_jobs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.notification_jobs
    set status = 'cancelled', updated_at = now()
    where entity_type = 'care_rule'
      and entity_id = old.id
      and status = 'pending';
    return old;
  end if;

  if new.deleted_at is not null
     or new.next_due_date is distinct from old.next_due_date
     or new.next_due_meter is distinct from old.next_due_meter
  then
    update public.notification_jobs
    set status = 'cancelled', updated_at = now()
    where entity_type = 'care_rule'
      and entity_id = new.id
      and status = 'pending';
  end if;
  return new;
end;
$$;

drop trigger if exists trg_care_cancel_notification_jobs on public.care_rules;
create trigger trg_care_cancel_notification_jobs
  after update or delete on public.care_rules
  for each row execute function public.cancel_stale_care_notification_jobs();

create or replace function public.cancel_stale_asset_notification_jobs()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  if tg_op = 'DELETE' then
    update public.notification_jobs
    set status = 'cancelled', updated_at = now()
    where entity_type = 'warranty'
      and entity_id = old.id
      and status = 'pending';
    return old;
  end if;

  if new.deleted_at is not null
     or new.warranty_expires_at is distinct from old.warranty_expires_at
  then
    update public.notification_jobs
    set status = 'cancelled', updated_at = now()
    where entity_type = 'warranty'
      and entity_id = new.id
      and status = 'pending';
  end if;

  if new.deleted_at is not null then
    update public.notification_jobs
    set status = 'cancelled', updated_at = now()
    where entity_type = 'care_rule'
      and entity_id in (select id from public.care_rules where asset_id = new.id)
      and status = 'pending';
  end if;

  return new;
end;
$$;

drop trigger if exists trg_assets_cancel_notification_jobs on public.assets;
create trigger trg_assets_cancel_notification_jobs
  after update or delete on public.assets
  for each row execute function public.cancel_stale_asset_notification_jobs();

-- Trava atômica idempotente para o worker de notificações (exclusiva service_role)
create or replace function public.claim_due_notification_jobs(p_batch_size int default 25)
returns setof public.notification_jobs
language plpgsql
security definer
set search_path = public
as $$
begin
  return query
  with due as (
    select id
    from public.notification_jobs
    where status = 'pending'
      and scheduled_for <= now()
    order by scheduled_for asc
    limit greatest(1, least(p_batch_size, 100))
    for update skip locked
  )
  update public.notification_jobs nj
  set status = 'processing',
      locked_at = now(),
      attempt_count = nj.attempt_count + 1,
      updated_at = now()
  from due
  where nj.id = due.id
  returning nj.*;
end;
$$;

revoke all on function public.claim_due_notification_jobs(int) from public, anon, authenticated;
grant execute on function public.claim_due_notification_jobs(int) to service_role;

-- Limpeza automática de jobs finalizados há mais de 30 dias (exclusiva service_role)
create or replace function public.cleanup_old_notification_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted integer;
begin
  delete from public.notification_jobs
  where created_at < now() - interval '30 days'
    and status in ('sent', 'failed', 'cancelled');
  get diagnostics v_deleted = row_count;
  return v_deleted;
end;
$$;

revoke all on function public.cleanup_old_notification_jobs() from public, anon, authenticated;
grant execute on function public.cleanup_old_notification_jobs() to service_role;

-- -----------------------------------------------------------------------------
-- 5. Políticas de Row Level Security (RLS Rigoroso: Privado vs. Compartilhado)
-- -----------------------------------------------------------------------------

alter table public.households enable row level security;
alter table public.profiles enable row level security;
alter table public.household_invites enable row level security;
alter table public.invite_redeem_attempts enable row level security;
alter table public.device_push_tokens enable row level security;
alter table public.chat_messages enable row level security;
alter table public.tasks enable row level security;
alter table public.house_routines enable row level security;
alter table public.mural_notes enable row level security;
alter table public.assets enable row level security;
alter table public.care_rules enable row level security;
alter table public.vault_items enable row level security;
alter table public.notification_jobs enable row level security;

-- households: visível e editável apenas pelos membros vinculados
create policy households_select_members on public.households
  for select to authenticated
  using (id = public.current_household_id() or created_by = auth.uid());

create policy households_update_members on public.households
  for update to authenticated
  using (id = public.current_household_id())
  with check (id = public.current_household_id());

-- profiles: lê o próprio perfil + parceiro do mesmo household; edita APENAS o próprio
create policy profiles_select_self_or_partner on public.profiles
  for select to authenticated
  using (
    id = auth.uid() or
    (household_id is not null and household_id = public.current_household_id())
  );

create policy profiles_insert_self on public.profiles
  for insert to authenticated
  with check (id = auth.uid() and household_id is null);

create policy profiles_update_self on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (
    id = auth.uid() and
    (household_id is not distinct from public.current_household_id())
  );

-- household_invites: apenas o criador consulta seus convites; criação/resgate via RPC
create policy household_invites_select_creator on public.household_invites
  for select to authenticated
  using (created_by = auth.uid());

-- device_push_tokens: estritamente privado por usuário
create policy device_push_tokens_owner_all on public.device_push_tokens
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- chat_messages: estritamente privado (parceiro nunca lê a Conversa do outro)
create policy chat_messages_owner_all on public.chat_messages
  for all to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

-- vault_items: Guardados estritamente privados
create policy vault_items_owner_all on public.vault_items
  for all to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

-- tasks: pessoais isoladas por owner_id; compartilhadas acessíveis e editáveis pelo casal
create policy tasks_select_access on public.tasks
  for select to authenticated
  using (
    (scope = 'personal' and owner_id = auth.uid()) or
    (scope = 'shared' and household_id is not null and household_id = public.current_household_id())
  );

create policy tasks_insert_access on public.tasks
  for insert to authenticated
  with check (
    owner_id = auth.uid() and (
      (scope = 'personal' and household_id is null) or
      (scope = 'shared' and household_id is not null and household_id = public.current_household_id())
    )
  );

create policy tasks_update_access on public.tasks
  for update to authenticated
  using (
    (scope = 'personal' and owner_id = auth.uid()) or
    (scope = 'shared' and household_id is not null and household_id = public.current_household_id())
  )
  with check (
    (scope = 'personal' and owner_id = auth.uid() and household_id is null) or
    (scope = 'shared' and household_id is not null and household_id = public.current_household_id())
  );
-- Sem DELETE físico pelo cliente em tasks (apenas soft delete via deleted_at)

-- house_routines: solo (owner_id sem household) ou compartilhado pelo casal
create policy house_routines_select_access on public.house_routines
  for select to authenticated
  using (
    (household_id is null and owner_id = auth.uid()) or
    (household_id is not null and household_id = public.current_household_id())
  );

create policy house_routines_insert_access on public.house_routines
  for insert to authenticated
  with check (
    owner_id = auth.uid() and created_by = auth.uid() and (
      (household_id is null and public.current_household_id() is null) or
      (household_id is not null and household_id = public.current_household_id())
    )
  );

create policy house_routines_update_access on public.house_routines
  for update to authenticated
  using (
    (household_id is null and owner_id = auth.uid()) or
    (household_id is not null and household_id = public.current_household_id())
  )
  with check (
    (household_id is null and owner_id = auth.uid()) or
    (household_id is not null and household_id = public.current_household_id())
  );

-- mural_notes: solo ou compartilhado pelo casal
create policy mural_notes_select_access on public.mural_notes
  for select to authenticated
  using (
    (household_id is null and owner_id = auth.uid()) or
    (household_id is not null and household_id = public.current_household_id())
  );

create policy mural_notes_insert_access on public.mural_notes
  for insert to authenticated
  with check (
    owner_id = auth.uid() and author_id = auth.uid() and (
      (household_id is null and public.current_household_id() is null) or
      (household_id is not null and household_id = public.current_household_id())
    )
  );

create policy mural_notes_update_access on public.mural_notes
  for update to authenticated
  using (
    (household_id is null and owner_id = auth.uid()) or
    (household_id is not null and household_id = public.current_household_id())
  )
  with check (
    (household_id is null and owner_id = auth.uid()) or
    (household_id is not null and household_id = public.current_household_id())
  );

-- assets: privados por owner_id ou compartilhados pelo household
create policy assets_select_access on public.assets
  for select to authenticated
  using (
    (scope = 'personal' and owner_id = auth.uid()) or
    (scope = 'shared' and household_id is not null and household_id = public.current_household_id())
  );

create policy assets_insert_access on public.assets
  for insert to authenticated
  with check (
    owner_id = auth.uid() and (
      (scope = 'personal' and household_id is null) or
      (scope = 'shared' and household_id is not null and household_id = public.current_household_id())
    )
  );

create policy assets_update_access on public.assets
  for update to authenticated
  using (
    (scope = 'personal' and owner_id = auth.uid()) or
    (scope = 'shared' and household_id is not null and household_id = public.current_household_id())
  )
  with check (
    (scope = 'personal' and owner_id = auth.uid() and household_id is null) or
    (scope = 'shared' and household_id is not null and household_id = public.current_household_id())
  );

-- care_rules: seguem o mesmo isolamento privado vs. compartilhado dos ativos
create policy care_rules_select_access on public.care_rules
  for select to authenticated
  using (
    (scope = 'personal' and owner_id = auth.uid()) or
    (scope = 'shared' and household_id is not null and household_id = public.current_household_id())
  );

create policy care_rules_insert_access on public.care_rules
  for insert to authenticated
  with check (
    owner_id = auth.uid()
    and (
      (scope = 'personal' and household_id is null) or
      (scope = 'shared' and household_id is not null and household_id = public.current_household_id())
    )
    and exists (
      select 1
      from public.assets a
      where a.id = asset_id
        and a.deleted_at is null
        and a.scope = care_rules.scope
        and (
          (a.scope = 'personal' and a.owner_id = auth.uid()) or
          (a.scope = 'shared' and a.household_id = public.current_household_id())
        )
    )
  );

create policy care_rules_update_access on public.care_rules
  for update to authenticated
  using (
    (scope = 'personal' and owner_id = auth.uid()) or
    (scope = 'shared' and household_id is not null and household_id = public.current_household_id())
  )
  with check (
    (
      (scope = 'personal' and owner_id = auth.uid() and household_id is null) or
      (scope = 'shared' and household_id is not null and household_id = public.current_household_id())
    )
    and exists (
      select 1
      from public.assets a
      where a.id = asset_id
        and a.scope = care_rules.scope
        and (
          (a.scope = 'personal' and a.owner_id = auth.uid()) or
          (a.scope = 'shared' and a.household_id = public.current_household_id())
        )
    )
  );

-- notification_jobs: leitura apenas do destinatário; enfileiramento apenas server-side (service_role / triggers);
-- cliente só pode cancelar seus próprios jobs pendentes (sem reativar ou criar call_alarm arbitrário)
create policy notification_jobs_select_recipient on public.notification_jobs
  for select to authenticated
  using (user_id = auth.uid());

create policy notification_jobs_cancel_own_pending on public.notification_jobs
  for update to authenticated
  using (user_id = auth.uid() and status = 'pending')
  with check (user_id = auth.uid() and status = 'cancelled');

-- -----------------------------------------------------------------------------
-- 6. Storage Privado (`meu-dia-media`) — Somente Signed URLs
-- -----------------------------------------------------------------------------

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values (
  'meu-dia-media',
  'meu-dia-media',
  false,
  5242880, -- teto de 5 MB (cliente já comprime para ~150 KB)
  array['image/webp', 'image/jpeg', 'image/png']
)
on conflict (id) do update
set public = false,
    file_size_limit = excluded.file_size_limit,
    allowed_mime_types = excluded.allowed_mime_types;

create policy storage_meu_dia_select on storage.objects
  for select to authenticated
  using (
    bucket_id = 'meu-dia-media' and (
      ((storage.foldername(name))[1] = 'personal' and (storage.foldername(name))[2] = auth.uid()::text) or
      (
        (storage.foldername(name))[1] = 'shared'
        and public.current_household_id() is not null
        and (storage.foldername(name))[2] = public.current_household_id()::text
      )
    )
  );

create policy storage_meu_dia_insert on storage.objects
  for insert to authenticated
  with check (
    bucket_id = 'meu-dia-media' and (
      ((storage.foldername(name))[1] = 'personal' and (storage.foldername(name))[2] = auth.uid()::text) or
      (
        (storage.foldername(name))[1] = 'shared'
        and public.current_household_id() is not null
        and (storage.foldername(name))[2] = public.current_household_id()::text
      )
    )
  );

create policy storage_meu_dia_delete on storage.objects
  for delete to authenticated
  using (
    bucket_id = 'meu-dia-media' and (
      ((storage.foldername(name))[1] = 'personal' and (storage.foldername(name))[2] = auth.uid()::text) or
      (
        (storage.foldername(name))[1] = 'shared'
        and public.current_household_id() is not null
        and (storage.foldername(name))[2] = public.current_household_id()::text
      )
    )
  );


-- =============================================================================
-- Meu Dia — Refinamentos SQL da Fase 2
-- 1) Permite resgate de convite quando usuário solo já gerou household de 1 membro
-- 2) Limpa tentativas antigas (>24h) de resgate junto com jobs antigos (>30d)
-- =============================================================================

create or replace function public.redeem_household_invite(p_code text)
returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_clean_code text := upper(trim(p_code));
  v_caller_household uuid;
  v_caller_member_count int;
  v_recent_attempts int;
  v_invite public.household_invites;
  v_member_count int;
begin
  if v_uid is null then
    return jsonb_build_object('ok', false, 'error', 'Usuário não autenticado.');
  end if;

  -- Rate-limit persistente: máx. 8 tentativas a cada 15 minutos por usuário
  select count(*) into v_recent_attempts
  from public.invite_redeem_attempts
  where user_id = v_uid
    and attempted_at > now() - interval '15 minutes';

  if v_recent_attempts >= 8 then
    return jsonb_build_object('ok', false, 'error', 'Muitas tentativas. Aguarde 15 minutos.');
  end if;

  -- Trava o perfil do chamador para verificar vínculo atual
  select household_id into v_caller_household
  from public.profiles
  where id = v_uid
  for update;

  select * into v_invite
  from public.household_invites
  where code = v_clean_code
  for update;

  if not found then
    insert into public.invite_redeem_attempts (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'error', 'Código de convite não encontrado.');
  end if;

  if v_invite.used_at is not null then
    insert into public.invite_redeem_attempts (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'error', 'Este convite já foi utilizado.');
  end if;

  if v_invite.expires_at <= now() then
    insert into public.invite_redeem_attempts (user_id) values (v_uid);
    return jsonb_build_object('ok', false, 'error', 'Este convite expirou (validade de 24 horas).');
  end if;

  if v_invite.created_by = v_uid then
    return jsonb_build_object('ok', false, 'error', 'Use este código na segunda conta para parear.');
  end if;

  if v_caller_household = v_invite.household_id then
    return jsonb_build_object('ok', false, 'error', 'Sua conta já participa deste espaço compartilhado.');
  end if;

  -- Trava os households envolvidos em ordem determinística de UUID para evitar deadlocks
  if v_caller_household is not null then
    perform 1
    from public.households
    where id in (v_caller_household, v_invite.household_id)
    order by id
    for update;

    select count(*) into v_caller_member_count
    from public.profiles
    where household_id = v_caller_household;

    if v_caller_member_count > 1 then
      return jsonb_build_object('ok', false, 'error', 'Sua conta já participa de um espaço compartilhado.');
    end if;
  else
    perform 1
    from public.households
    where id = v_invite.household_id
    for update;
  end if;

  select count(*) into v_member_count
  from public.profiles
  where household_id = v_invite.household_id;

  if v_member_count >= 2 then
    return jsonb_build_object('ok', false, 'error', 'Este espaço compartilhado já possui 2 contas vinculadas.');
  end if;

  -- Vincula perfil ao household do parceiro
  update public.profiles
  set household_id = v_invite.household_id, updated_at = now()
  where id = v_uid;

  -- Migra rotinas, mural e itens compartilhados do usuário solo (sem household ou do household solo anterior)
  update public.house_routines
  set household_id = v_invite.household_id, updated_at = now()
  where owner_id = v_uid
    and (household_id is null or household_id = v_caller_household);

  update public.mural_notes
  set household_id = v_invite.household_id, updated_at = now()
  where owner_id = v_uid
    and (household_id is null or household_id = v_caller_household);

  if v_caller_household is not null then
    update public.tasks
    set household_id = v_invite.household_id, updated_at = now()
    where owner_id = v_uid
      and scope = 'shared'
      and household_id = v_caller_household;

    update public.assets
    set household_id = v_invite.household_id, updated_at = now()
    where owner_id = v_uid
      and scope = 'shared'
      and household_id = v_caller_household;

    update public.care_rules
    set household_id = v_invite.household_id, updated_at = now()
    where owner_id = v_uid
      and scope = 'shared'
      and household_id = v_caller_household;

    update public.notification_jobs
    set household_id = v_invite.household_id, updated_at = now()
    where user_id = v_uid
      and household_id = v_caller_household;

    -- Remove o household solo vazio (convites pendentes desse solo saem em cascade)
    delete from public.households
    where id = v_caller_household
      and not exists (
        select 1 from public.profiles where household_id = v_caller_household
      );
  end if;

  update public.household_invites
  set used_by = v_uid, used_at = now()
  where id = v_invite.id;

  return jsonb_build_object('ok', true, 'household_id', v_invite.household_id);
end;
$$;

revoke all on function public.redeem_household_invite(text) from public, anon;
grant execute on function public.redeem_household_invite(text) to authenticated;

-- Atualiza rotina de limpeza para incluir invite_redeem_attempts (>24h)
create or replace function public.cleanup_old_notification_jobs()
returns integer
language plpgsql
security definer
set search_path = public
as $$
declare
  v_deleted_jobs integer := 0;
  v_deleted_attempts integer := 0;
begin
  delete from public.notification_jobs
  where created_at < now() - interval '30 days'
    and status in ('sent', 'failed', 'cancelled');
  get diagnostics v_deleted_jobs = row_count;

  delete from public.invite_redeem_attempts
  where attempted_at < now() - interval '24 hours';
  get diagnostics v_deleted_attempts = row_count;

  return v_deleted_jobs + v_deleted_attempts;
end;
$$;

revoke all on function public.cleanup_old_notification_jobs() from public, anon, authenticated;
grant execute on function public.cleanup_old_notification_jobs() to service_role;


-- =============================================================================
-- Meu Dia — Fase 4: Triggers Server-Side de Notificações & Agendamento pg_cron
-- Fuso padrão explícito: America/Sao_Paulo (ou timezone do perfil).
-- =============================================================================

create or replace function public.resolve_profile_timezone(p_user_id uuid)
returns text
language sql
stable
security definer
set search_path = public
as $$
  select coalesce(nullif(trim(timezone), ''), 'America/Sao_Paulo')
  from public.profiles
  where id = p_user_id;
$$;

revoke all on function public.resolve_profile_timezone(uuid) from public, anon, authenticated;

-- Enfileira/reagenda notification_jobs para Tarefas (Agenda / Aguardando)
create or replace function public.enqueue_task_notification_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_tz text;
  v_target_ts timestamptz;
  v_delivery text;
  v_title text;
  v_body text;
begin
  if new.deleted_at is not null or new.status not in ('open', 'waiting') then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.due_date is not distinct from old.due_date
     and new.due_time is not distinct from old.due_time
     and new.waiting_remind_at is not distinct from old.waiting_remind_at
     and new.alarm_call_mode is not distinct from old.alarm_call_mode
     and new.title is not distinct from old.title
     and new.assigned_user_id is not distinct from old.assigned_user_id
  then
    return new;
  end if;

  v_recipient := coalesce(new.assigned_user_id, new.owner_id);
  v_tz := coalesce(public.resolve_profile_timezone(v_recipient), 'America/Sao_Paulo');

  if new.status = 'waiting' and new.waiting_remind_at is not null then
    v_target_ts := new.waiting_remind_at;
    v_title := 'Aguardando retorno';
    v_body := new.title;
  elsif new.due_date is not null and (new.due_time is not null or new.alarm_call_mode = true) then
    v_target_ts := ((new.due_date::text || ' ' || coalesce(new.due_time::text, '09:00:00'))::timestamp at time zone v_tz);
    v_title := case when new.alarm_call_mode then 'Lembrete importante' else 'Lembrete do Meu Dia' end;
    v_body := new.title;
  else
    return new;
  end if;

  if v_target_ts <= now() then
    return new;
  end if;

  v_delivery := case when new.alarm_call_mode then 'call_alarm' else 'push' end;

  update public.notification_jobs
  set status = 'cancelled', updated_at = now()
  where entity_type = 'task'
    and entity_id = new.id
    and status = 'pending';

  insert into public.notification_jobs (
    user_id,
    household_id,
    entity_type,
    entity_id,
    delivery_mode,
    title,
    body,
    scheduled_for,
    status,
    deep_link_message_id
  )
  values (
    v_recipient,
    case when new.scope = 'shared' then new.household_id else null end,
    'task',
    new.id,
    v_delivery,
    v_title,
    v_body,
    v_target_ts,
    'pending',
    new.source_message_id
  );

  return new;
end;
$$;

drop trigger if exists trg_tasks_z_enqueue_notification_jobs on public.tasks;
create trigger trg_tasks_z_enqueue_notification_jobs
  after insert or update on public.tasks
  for each row execute function public.enqueue_task_notification_job();

-- Enfileira/reagenda notification_jobs para Recados do Mural
create or replace function public.enqueue_mural_notification_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_recipient uuid;
  v_delivery text;
begin
  if new.deleted_at is not null
     or new.status in ('acknowledged', 'dismissed')
     or new.notify_at is null
     or new.notify_at <= now()
  then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.status is not distinct from old.status
     and new.notify_at is not distinct from old.notify_at
     and new.alarm_call_mode is not distinct from old.alarm_call_mode
     and new.body is not distinct from old.body
     and new.recipient_id is not distinct from old.recipient_id
  then
    return new;
  end if;

  v_recipient := new.recipient_id;
  if v_recipient is null and new.household_id is not null then
    select id into v_recipient
    from public.profiles
    where household_id = new.household_id
      and id <> new.author_id
    limit 1;
  end if;
  v_recipient := coalesce(v_recipient, new.owner_id);

  v_delivery := case when new.alarm_call_mode then 'call_alarm' else 'push' end;

  update public.notification_jobs
  set status = 'cancelled', updated_at = now()
  where entity_type = 'mural_note'
    and entity_id = new.id
    and status = 'pending';

  insert into public.notification_jobs (
    user_id,
    household_id,
    entity_type,
    entity_id,
    delivery_mode,
    title,
    body,
    scheduled_for,
    status,
    deep_link_message_id
  )
  values (
    v_recipient,
    new.household_id,
    'mural_note',
    new.id,
    v_delivery,
    case when new.alarm_call_mode then 'Recado urgente no Mural' else 'Recado no Mural' end,
    new.body,
    new.notify_at,
    'pending',
    new.source_message_id
  );

  return new;
end;
$$;

drop trigger if exists trg_mural_z_enqueue_notification_jobs on public.mural_notes;
create trigger trg_mural_z_enqueue_notification_jobs
  after insert or update on public.mural_notes
  for each row execute function public.enqueue_mural_notification_job();

-- Enfileira aviso suave 30 dias antes do vencimento da garantia do ativo (às 09:00 no fuso do perfil)
create or replace function public.enqueue_asset_warranty_notification_job()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_tz text;
  v_alert_date date;
  v_target_ts timestamptz;
  v_today_local date;
begin
  if new.deleted_at is not null or new.warranty_expires_at is null then
    return new;
  end if;

  if tg_op = 'UPDATE'
     and new.warranty_expires_at is not distinct from old.warranty_expires_at
     and old.deleted_at is null
  then
    return new;
  end if;

  v_tz := coalesce(public.resolve_profile_timezone(new.owner_id), 'America/Sao_Paulo');
  v_today_local := (now() at time zone v_tz)::date;

  if new.warranty_expires_at < v_today_local then
    return new;
  end if;

  v_alert_date := new.warranty_expires_at - 30;
  v_target_ts := ((v_alert_date::text || ' 09:00:00')::timestamp at time zone v_tz);

  if v_target_ts <= now() then
    v_target_ts := now() + interval '5 minutes';
  end if;

  update public.notification_jobs
  set status = 'cancelled', updated_at = now()
  where entity_type = 'warranty'
    and entity_id = new.id
    and status = 'pending';

  insert into public.notification_jobs (
    user_id,
    household_id,
    entity_type,
    entity_id,
    delivery_mode,
    title,
    body,
    scheduled_for,
    status
  )
  values (
    new.owner_id,
    case when new.scope = 'shared' then new.household_id else null end,
    'warranty',
    new.id,
    'push',
    'Garantia próxima do vencimento',
    format('A garantia de %s vence em %s.', new.name, to_char(new.warranty_expires_at, 'DD/MM/YYYY')),
    v_target_ts,
    'pending'
  );

  return new;
end;
$$;

drop trigger if exists trg_assets_z_enqueue_warranty_jobs on public.assets;
create trigger trg_assets_z_enqueue_warranty_jobs
  after insert or update on public.assets
  for each row execute function public.enqueue_asset_warranty_notification_job();

-- -----------------------------------------------------------------------------
-- Agendamento pg_cron (idempotente — executa apenas se pg_cron estiver ativo)
-- Para ativar a chamada HTTP ao dispatch-notifications no Supabase:
--   1. Habilite as extensões `pg_cron` e `pg_net` no Dashboard do Supabase.
--   2. Configure os secrets no Vault (`meu_dia_supabase_url` e `meu_dia_cron_secret`)
--      e descomente/ajuste o bloco de dispatch abaixo.
-- -----------------------------------------------------------------------------
do $$
begin
  if exists (select 1 from pg_extension where extname = 'pg_cron') then
    -- Limpeza diária às 06:00 UTC (03:00 America/Sao_Paulo)
    perform cron.unschedule('meu-dia-cleanup-jobs')
    where exists (select 1 from cron.job where jobname = 'meu-dia-cleanup-jobs');

    perform cron.schedule(
      'meu-dia-cleanup-jobs',
      '0 6 * * *',
      $cron$select public.cleanup_old_notification_jobs();$cron$
    );
  end if;
exception
  when others then
    raise notice 'pg_cron não habilitado neste ambiente; configure após ativar a extensão.';
end;
$$;

-- Exemplo pronto para agendar o worker `dispatch-notifications` a cada minuto via pg_cron + pg_net:
-- select cron.schedule(
--   'meu-dia-dispatch-notifications',
--   '* * * * *',
--   $$
--   select net.http_post(
--     url := current_setting('app.settings.supabase_url', true) || '/functions/v1/dispatch-notifications',
--     headers := jsonb_build_object(
--       'Content-Type', 'application/json',
--       'Authorization', 'Bearer ' || current_setting('app.settings.cron_secret', true)
--     ),
--     body := '{}'::jsonb
--   );
--   $$
-- );
