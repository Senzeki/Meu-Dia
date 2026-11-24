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
