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
