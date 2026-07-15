-- Funções finais: a biometria ativa é obrigatória antes de qualquer privilégio financeiro.

create or replace function public.finance_access_get_by_finance_user(p_finance_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = security, public, pg_temp
as $$
  select jsonb_build_object(
    'id', g.id,
    'intranet_user_id', g.intranet_user_id,
    'corporate_email', g.corporate_email,
    'finance_user_id', g.finance_user_id,
    'full_name', g.full_name,
    'role', g.role,
    'status', g.status,
    'biometric_required', g.biometric_required,
    'biometric_status', coalesce(b.status, case when g.biometric_required then 'required' else 'active' end),
    'biometric_enrollment_id', b.id,
    'expires_at', g.expires_at,
    'can_manage_master', g.role = 'owner' and g.status = 'active' and coalesce(b.status, 'required') = 'active',
    'can_manage_users', g.role in ('owner','master_admin') and g.status = 'active' and coalesce(b.status, 'required') = 'active',
    'can_edit_finance', g.role in ('owner','master_admin','editor') and g.status = 'active' and coalesce(b.status, 'required') = 'active'
  )
  from security.finance_access_grants g
  left join security.finance_biometric_enrollments b on b.access_grant_id = g.id
  where g.finance_user_id = p_finance_user_id
  limit 1;
$$;

create or replace function public.finance_access_get_by_identity(
  p_intranet_user_id uuid,
  p_corporate_email text
)
returns jsonb
language sql
stable
security definer
set search_path = security, public, pg_temp
as $$
  select jsonb_build_object(
    'id', g.id,
    'intranet_user_id', g.intranet_user_id,
    'corporate_email', g.corporate_email,
    'finance_user_id', g.finance_user_id,
    'full_name', g.full_name,
    'role', g.role,
    'status', g.status,
    'biometric_required', g.biometric_required,
    'biometric_status', coalesce(b.status, case when g.biometric_required then 'required' else 'active' end)
  )
  from security.finance_access_grants g
  left join security.finance_biometric_enrollments b on b.access_grant_id = g.id
  where (
    p_intranet_user_id is not null and g.intranet_user_id = p_intranet_user_id
  ) or (
    lower(g.corporate_email) = lower(trim(p_corporate_email))
  )
  order by case
    when p_intranet_user_id is not null and g.intranet_user_id = p_intranet_user_id then 0
    else 1
  end
  limit 1;
$$;

create or replace function public.finance_bind_intranet_identity(
  p_finance_user_id uuid,
  p_intranet_user_id uuid,
  p_corporate_email text
)
returns boolean
language plpgsql
security definer
set search_path = security, public, pg_temp
as $$
declare
  affected integer := 0;
begin
  if p_intranet_user_id is null then
    return false;
  end if;

  update security.finance_access_grants
  set intranet_user_id = p_intranet_user_id,
      corporate_email = lower(trim(p_corporate_email)),
      updated_at = now()
  where finance_user_id = p_finance_user_id
    and lower(corporate_email) = lower(trim(p_corporate_email));
  get diagnostics affected = row_count;

  if affected = 0 then
    return false;
  end if;

  update security.finance_biometric_enrollments
  set intranet_user_id = p_intranet_user_id,
      corporate_email = lower(trim(p_corporate_email)),
      updated_at = now()
  where finance_user_id = p_finance_user_id;

  update security.finance_governance
  set owner_intranet_user_id = case
        when owner_finance_user_id = p_finance_user_id then p_intranet_user_id
        else owner_intranet_user_id
      end,
      master_intranet_user_id = case
        when master_finance_user_id = p_finance_user_id then p_intranet_user_id
        else master_intranet_user_id
      end,
      updated_at = now(),
      revision = revision + 1
  where id = 1;

  return true;
end;
$$;

create or replace function public.finance_touch_access(p_finance_user_id uuid)
returns void
language sql
security definer
set search_path = security, public, pg_temp
as $$
  update security.finance_access_grants
  set last_access_at = now(), updated_at = now()
  where finance_user_id = p_finance_user_id;
$$;

create or replace function public.finance_list_access(p_actor_finance_user_id uuid)
returns jsonb
language plpgsql
stable
security definer
set search_path = security, public, pg_temp
as $$
declare
  actor_role text;
  actor_status text;
  actor_biometric_status text;
  result jsonb;
begin
  select g.role, g.status, b.status
  into actor_role, actor_status, actor_biometric_status
  from security.finance_access_grants g
  left join security.finance_biometric_enrollments b on b.access_grant_id = g.id
  where g.finance_user_id = p_actor_finance_user_id;

  if actor_role not in ('owner','master_admin')
     or actor_status <> 'active'
     or actor_biometric_status <> 'active' then
    raise exception 'finance access management denied' using errcode = '42501';
  end if;

  select coalesce(jsonb_agg(jsonb_build_object(
    'id', g.id,
    'intranet_user_id', g.intranet_user_id,
    'corporate_email', g.corporate_email,
    'finance_user_id', g.finance_user_id,
    'full_name', g.full_name,
    'role', g.role,
    'status', g.status,
    'biometric_status', coalesce(b.status, 'required'),
    'granted_at', g.granted_at,
    'last_access_at', g.last_access_at
  ) order by case g.role when 'owner' then 0 when 'master_admin' then 1 else 2 end, g.full_name, g.corporate_email), '[]'::jsonb)
  into result
  from security.finance_access_grants g
  left join security.finance_biometric_enrollments b on b.access_grant_id = g.id;

  return result;
end;
$$;

create or replace function public.finance_assign_master(
  p_actor_finance_user_id uuid,
  p_target_finance_user_id uuid,
  p_target_intranet_user_id uuid,
  p_target_corporate_email text,
  p_target_full_name text
)
returns jsonb
language plpgsql
security definer
set search_path = security, public, pg_temp
as $$
declare
  actor_role text;
  actor_status text;
  actor_biometric_status text;
  old_master security.finance_access_grants%rowtype;
  target_record security.finance_access_grants%rowtype;
begin
  if p_target_intranet_user_id is null then
    raise exception 'intranet user id is required' using errcode = '22023';
  end if;

  select g.role, g.status, b.status
  into actor_role, actor_status, actor_biometric_status
  from security.finance_access_grants g
  left join security.finance_biometric_enrollments b on b.access_grant_id = g.id
  where g.finance_user_id = p_actor_finance_user_id;

  if actor_role is distinct from 'owner'
     or actor_status <> 'active'
     or actor_biometric_status <> 'active' then
    raise exception 'only active biometric-verified finance owner can assign master administrator' using errcode = '42501';
  end if;

  if p_target_finance_user_id = p_actor_finance_user_id then
    raise exception 'owner cannot also be master administrator' using errcode = '22023';
  end if;

  select * into old_master
  from security.finance_access_grants
  where role = 'master_admin' and status <> 'revoked'
  limit 1;

  if found then
    update security.finance_access_grants
    set role = 'viewer', status = 'blocked', blocked_at = now(), updated_at = now()
    where id = old_master.id;

    update public.user_roles
    set role = 'blocked'::public.user_role, updated_at = now()
    where user_id = old_master.finance_user_id;
  end if;

  insert into security.finance_access_grants (
    intranet_user_id, corporate_email, finance_user_id, full_name, role, status,
    biometric_required, granted_by_finance_user_id, grant_reason
  ) values (
    p_target_intranet_user_id,
    lower(trim(p_target_corporate_email)),
    p_target_finance_user_id,
    nullif(trim(p_target_full_name), ''),
    'master_admin',
    'pending_face',
    true,
    p_actor_finance_user_id,
    'Administrador Master definido pelo Proprietário do Financeiro'
  )
  on conflict (finance_user_id) do update
  set intranet_user_id = excluded.intranet_user_id,
      corporate_email = excluded.corporate_email,
      full_name = excluded.full_name,
      role = 'master_admin',
      status = case when exists (
        select 1 from security.finance_biometric_enrollments b
        where b.finance_user_id = excluded.finance_user_id and b.status = 'active'
      ) then 'active' else 'pending_face' end,
      biometric_required = true,
      granted_by_finance_user_id = p_actor_finance_user_id,
      grant_reason = excluded.grant_reason,
      blocked_at = null,
      revoked_at = null,
      updated_at = now()
  returning * into target_record;

  insert into security.finance_biometric_enrollments (
    access_grant_id, finance_user_id, intranet_user_id, corporate_email, status
  ) values (
    target_record.id,
    target_record.finance_user_id,
    target_record.intranet_user_id,
    target_record.corporate_email,
    'required'
  )
  on conflict (access_grant_id) do update
  set intranet_user_id = excluded.intranet_user_id,
      corporate_email = excluded.corporate_email,
      status = case
        when security.finance_biometric_enrollments.status = 'active' then 'active'
        else 'required'
      end,
      updated_at = now();

  insert into public.user_roles (user_id, role, updated_at)
  values (
    target_record.finance_user_id,
    case when target_record.status = 'active'
      then 'admin'::public.user_role
      else 'blocked'::public.user_role
    end,
    now()
  )
  on conflict (user_id) do update
  set role = excluded.role, updated_at = excluded.updated_at;

  update security.finance_governance
  set master_corporate_email = target_record.corporate_email,
      master_intranet_user_id = target_record.intranet_user_id,
      master_finance_user_id = target_record.finance_user_id,
      master_assigned_at = now(),
      master_assigned_by = p_actor_finance_user_id,
      revision = revision + 1,
      updated_at = now()
  where id = 1;

  insert into security.finance_access_audit (
    event_type, actor_finance_user_id, target_finance_user_id,
    target_intranet_user_id, target_corporate_email, previous_state, new_state
  ) values (
    'finance.master_assigned',
    p_actor_finance_user_id,
    target_record.finance_user_id,
    target_record.intranet_user_id,
    target_record.corporate_email,
    case when old_master.id is null then null else to_jsonb(old_master) end,
    to_jsonb(target_record)
  );

  return public.finance_access_get_by_finance_user(target_record.finance_user_id);
end;
$$;

create or replace function public.finance_grant_access(
  p_actor_finance_user_id uuid,
  p_target_finance_user_id uuid,
  p_target_intranet_user_id uuid,
  p_target_corporate_email text,
  p_target_full_name text,
  p_role text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = security, public, pg_temp
as $$
declare
  actor_role text;
  actor_status text;
  actor_biometric_status text;
  existing_record security.finance_access_grants%rowtype;
  target_record security.finance_access_grants%rowtype;
begin
  if p_role not in ('editor','viewer','auditor') then
    raise exception 'invalid assignable finance role' using errcode = '22023';
  end if;

  if p_target_intranet_user_id is null then
    raise exception 'intranet user id is required' using errcode = '22023';
  end if;

  select g.role, g.status, b.status
  into actor_role, actor_status, actor_biometric_status
  from security.finance_access_grants g
  left join security.finance_biometric_enrollments b on b.access_grant_id = g.id
  where g.finance_user_id = p_actor_finance_user_id;

  if actor_role not in ('owner','master_admin')
     or actor_status <> 'active'
     or actor_biometric_status <> 'active' then
    raise exception 'finance access management denied' using errcode = '42501';
  end if;

  select * into existing_record
  from security.finance_access_grants
  where finance_user_id = p_target_finance_user_id
  limit 1;

  if existing_record.role in ('owner','master_admin') then
    raise exception 'owner or master role cannot be changed by ordinary grant operation' using errcode = '42501';
  end if;

  insert into security.finance_access_grants (
    intranet_user_id, corporate_email, finance_user_id, full_name, role, status,
    biometric_required, granted_by_finance_user_id, grant_reason
  ) values (
    p_target_intranet_user_id,
    lower(trim(p_target_corporate_email)),
    p_target_finance_user_id,
    nullif(trim(p_target_full_name), ''),
    p_role,
    'pending_face',
    true,
    p_actor_finance_user_id,
    nullif(trim(p_reason), '')
  )
  on conflict (finance_user_id) do update
  set intranet_user_id = excluded.intranet_user_id,
      corporate_email = excluded.corporate_email,
      full_name = excluded.full_name,
      role = excluded.role,
      status = case when exists (
        select 1 from security.finance_biometric_enrollments b
        where b.finance_user_id = excluded.finance_user_id and b.status = 'active'
      ) then 'active' else 'pending_face' end,
      biometric_required = true,
      granted_by_finance_user_id = p_actor_finance_user_id,
      grant_reason = excluded.grant_reason,
      blocked_at = null,
      revoked_at = null,
      updated_at = now()
  returning * into target_record;

  insert into security.finance_biometric_enrollments (
    access_grant_id, finance_user_id, intranet_user_id, corporate_email, status
  ) values (
    target_record.id,
    target_record.finance_user_id,
    target_record.intranet_user_id,
    target_record.corporate_email,
    'required'
  )
  on conflict (access_grant_id) do update
  set intranet_user_id = excluded.intranet_user_id,
      corporate_email = excluded.corporate_email,
      updated_at = now();

  insert into public.user_roles (user_id, role, updated_at)
  values (
    target_record.finance_user_id,
    case when target_record.status = 'active' then
      case target_record.role
        when 'editor' then 'finance_editor'::public.user_role
        when 'viewer' then 'finance_viewer'::public.user_role
        when 'auditor' then 'auditor'::public.user_role
        else 'blocked'::public.user_role
      end
    else 'blocked'::public.user_role end,
    now()
  )
  on conflict (user_id) do update
  set role = excluded.role, updated_at = excluded.updated_at;

  insert into security.finance_access_audit (
    event_type, actor_finance_user_id, target_finance_user_id,
    target_intranet_user_id, target_corporate_email,
    previous_state, new_state, metadata
  ) values (
    'finance.access_granted',
    p_actor_finance_user_id,
    target_record.finance_user_id,
    target_record.intranet_user_id,
    target_record.corporate_email,
    case when existing_record.id is null then null else to_jsonb(existing_record) end,
    to_jsonb(target_record),
    jsonb_build_object('reason', p_reason)
  );

  return public.finance_access_get_by_finance_user(target_record.finance_user_id);
end;
$$;

create or replace function public.finance_change_access_status(
  p_actor_finance_user_id uuid,
  p_target_finance_user_id uuid,
  p_new_status text,
  p_reason text
)
returns jsonb
language plpgsql
security definer
set search_path = security, public, pg_temp
as $$
declare
  actor_role text;
  actor_status text;
  actor_biometric_status text;
  target_record security.finance_access_grants%rowtype;
  previous_record security.finance_access_grants%rowtype;
  target_biometric_status text;
  legacy_role public.user_role;
begin
  if p_new_status not in ('active','blocked','revoked','pending_face') then
    raise exception 'invalid finance access status' using errcode = '22023';
  end if;

  select g.role, g.status, b.status
  into actor_role, actor_status, actor_biometric_status
  from security.finance_access_grants g
  left join security.finance_biometric_enrollments b on b.access_grant_id = g.id
  where g.finance_user_id = p_actor_finance_user_id;

  if actor_role not in ('owner','master_admin')
     or actor_status <> 'active'
     or actor_biometric_status <> 'active' then
    raise exception 'finance access management denied' using errcode = '42501';
  end if;

  select * into previous_record
  from security.finance_access_grants
  where finance_user_id = p_target_finance_user_id;

  if not found then
    raise exception 'finance access target not found' using errcode = 'P0002';
  end if;

  if previous_record.role = 'owner' then
    raise exception 'finance owner cannot be changed by access administration' using errcode = '42501';
  end if;

  if previous_record.role = 'master_admin' and actor_role <> 'owner' then
    raise exception 'only finance owner can change master administrator' using errcode = '42501';
  end if;

  select status into target_biometric_status
  from security.finance_biometric_enrollments
  where finance_user_id = p_target_finance_user_id;

  if p_new_status = 'active' and target_biometric_status <> 'active' then
    raise exception 'biometric enrollment must be active before finance access activation' using errcode = '42501';
  end if;

  update security.finance_access_grants
  set status = p_new_status,
      blocked_at = case when p_new_status = 'blocked' then now() else null end,
      revoked_at = case when p_new_status = 'revoked' then now() else null end,
      activated_at = case when p_new_status = 'active' then coalesce(activated_at, now()) else activated_at end,
      updated_at = now()
  where finance_user_id = p_target_finance_user_id
  returning * into target_record;

  if target_record.role = 'master_admin' and p_new_status in ('blocked','revoked') then
    update security.finance_governance
    set master_corporate_email = null,
        master_intranet_user_id = null,
        master_finance_user_id = null,
        master_assigned_at = null,
        master_assigned_by = p_actor_finance_user_id,
        revision = revision + 1,
        updated_at = now()
    where id = 1;
  end if;

  legacy_role := case
    when p_new_status <> 'active' then 'blocked'::public.user_role
    when target_record.role = 'master_admin' then 'admin'::public.user_role
    when target_record.role = 'editor' then 'finance_editor'::public.user_role
    when target_record.role = 'viewer' then 'finance_viewer'::public.user_role
    when target_record.role = 'auditor' then 'auditor'::public.user_role
    else 'blocked'::public.user_role
  end;

  insert into public.user_roles (user_id, role, updated_at)
  values (target_record.finance_user_id, legacy_role, now())
  on conflict (user_id) do update
  set role = excluded.role, updated_at = excluded.updated_at;

  insert into security.finance_access_audit (
    event_type, actor_finance_user_id, target_finance_user_id,
    target_intranet_user_id, target_corporate_email,
    previous_state, new_state, metadata
  ) values (
    'finance.access_status_changed',
    p_actor_finance_user_id,
    target_record.finance_user_id,
    target_record.intranet_user_id,
    target_record.corporate_email,
    to_jsonb(previous_record),
    to_jsonb(target_record),
    jsonb_build_object('reason', p_reason, 'new_status', p_new_status)
  );

  return public.finance_access_get_by_finance_user(target_record.finance_user_id);
end;
$$;

create or replace function public.finance_biometric_get_status(p_finance_user_id uuid)
returns jsonb
language sql
stable
security definer
set search_path = security, public, pg_temp
as $$
  select jsonb_build_object(
    'id', b.id,
    'status', b.status,
    'consent_version', b.consent_version,
    'consented_at', b.consented_at,
    'model_provider', b.model_provider,
    'model_version', b.model_version,
    'quality_score', b.quality_score,
    'enrolled_at', b.enrolled_at,
    'last_verified_at', b.last_verified_at,
    'failed_attempts', b.failed_attempts,
    'locked_until', b.locked_until,
    'sample_count', (
      select count(*) from security.finance_biometric_samples s
      where s.enrollment_id = b.id
    )
  )
  from security.finance_biometric_enrollments b
  where b.finance_user_id = p_finance_user_id
  limit 1;
$$;

create or replace function public.finance_biometric_begin(
  p_finance_user_id uuid,
  p_purpose text,
  p_challenge jsonb,
  p_expires_at timestamptz
)
returns uuid
language plpgsql
security definer
set search_path = security, public, pg_temp
as $$
declare
  enrollment_id uuid;
  session_id uuid;
begin
  if p_purpose not in ('enrollment','verification','recapture') then
    raise exception 'invalid biometric purpose' using errcode = '22023';
  end if;

  select id into enrollment_id
  from security.finance_biometric_enrollments
  where finance_user_id = p_finance_user_id
    and status not in ('blocked','revoked');

  if enrollment_id is null then
    raise exception 'biometric enrollment not available' using errcode = 'P0002';
  end if;

  update security.finance_biometric_sessions
  set status = 'expired', completed_at = now(), updated_at = now()
  where finance_user_id = p_finance_user_id
    and status in ('created','started')
    and expires_at <= now();

  insert into security.finance_biometric_sessions (
    enrollment_id, finance_user_id, purpose, challenge, status, expires_at
  ) values (
    enrollment_id,
    p_finance_user_id,
    p_purpose,
    coalesce(p_challenge, '{}'::jsonb),
    'created',
    p_expires_at
  ) returning id into session_id;

  update security.finance_biometric_enrollments
  set status = case when p_purpose = 'enrollment' then 'capturing' else status end,
      updated_at = now()
  where id = enrollment_id;

  return session_id;
end;
$$;

create or replace function public.finance_biometric_complete_enrollment(
  p_finance_user_id uuid,
  p_session_id uuid,
  p_consent_version text,
  p_model_provider text,
  p_model_version text,
  p_descriptor_ciphertext text,
  p_descriptor_iv text,
  p_descriptor_algorithm text,
  p_descriptor_dimensions integer,
  p_quality_score numeric,
  p_liveness_method text,
  p_samples jsonb,
  p_provider_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = security, public, pg_temp
as $$
declare
  v_enrollment_id uuid;
  v_access_id uuid;
  v_access_role text;
  v_sample jsonb;
  v_sample_count integer := 0;
  v_legacy_role public.user_role;
begin
  select s.enrollment_id into v_enrollment_id
  from security.finance_biometric_sessions s
  where s.id = p_session_id
    and s.finance_user_id = p_finance_user_id
    and s.purpose in ('enrollment','recapture')
    and s.status in ('created','started')
    and s.expires_at > now();

  if v_enrollment_id is null then
    raise exception 'biometric session invalid or expired' using errcode = '22023';
  end if;

  if jsonb_typeof(p_samples) <> 'array' or jsonb_array_length(p_samples) < 3 then
    raise exception 'at least three biometric samples are required' using errcode = '22023';
  end if;

  delete from security.finance_biometric_samples s
  where s.enrollment_id = v_enrollment_id;

  for v_sample in select * from jsonb_array_elements(p_samples)
  loop
    insert into security.finance_biometric_samples (
      enrollment_id, pose, storage_path, content_hash, mime_type, size_bytes,
      width, height, quality_score, captured_at
    ) values (
      v_enrollment_id,
      v_sample->>'pose',
      v_sample->>'storage_path',
      v_sample->>'content_hash',
      v_sample->>'mime_type',
      (v_sample->>'size_bytes')::integer,
      nullif(v_sample->>'width','')::integer,
      nullif(v_sample->>'height','')::integer,
      nullif(v_sample->>'quality_score','')::numeric,
      coalesce(nullif(v_sample->>'captured_at','')::timestamptz, now())
    );
    v_sample_count := v_sample_count + 1;
  end loop;

  update security.finance_biometric_enrollments
  set status = 'active',
      consent_version = p_consent_version,
      consented_at = now(),
      model_provider = p_model_provider,
      model_version = p_model_version,
      descriptor_ciphertext = p_descriptor_ciphertext,
      descriptor_iv = p_descriptor_iv,
      descriptor_algorithm = p_descriptor_algorithm,
      descriptor_dimensions = p_descriptor_dimensions,
      quality_score = p_quality_score,
      liveness_method = p_liveness_method,
      enrolled_at = now(),
      failed_attempts = 0,
      locked_until = null,
      updated_at = now()
  where id = v_enrollment_id;

  select b.access_grant_id, g.role
  into v_access_id, v_access_role
  from security.finance_biometric_enrollments b
  join security.finance_access_grants g on g.id = b.access_grant_id
  where b.id = v_enrollment_id;

  update security.finance_access_grants
  set status = 'active',
      activated_at = coalesce(activated_at, now()),
      updated_at = now()
  where id = v_access_id and status = 'pending_face';

  v_legacy_role := case v_access_role
    when 'owner' then 'super_admin'::public.user_role
    when 'master_admin' then 'admin'::public.user_role
    when 'editor' then 'finance_editor'::public.user_role
    when 'viewer' then 'finance_viewer'::public.user_role
    when 'auditor' then 'auditor'::public.user_role
    else 'blocked'::public.user_role
  end;

  insert into public.user_roles (user_id, role, updated_at)
  values (p_finance_user_id, v_legacy_role, now())
  on conflict (user_id) do update
  set role = excluded.role, updated_at = excluded.updated_at;

  update security.finance_biometric_sessions
  set status = 'approved',
      liveness_result = 'approved',
      face_match_result = 'reference_enrolled',
      confidence_score = p_quality_score,
      provider_payload = coalesce(p_provider_payload, '{}'::jsonb),
      completed_at = now(),
      updated_at = now()
  where id = p_session_id;

  insert into security.finance_access_audit (
    event_type, actor_finance_user_id, target_finance_user_id, new_state, metadata
  ) values (
    'finance.biometric_enrolled',
    p_finance_user_id,
    p_finance_user_id,
    public.finance_biometric_get_status(p_finance_user_id),
    jsonb_build_object(
      'sample_count', v_sample_count,
      'model_provider', p_model_provider,
      'model_version', p_model_version
    )
  );

  return public.finance_access_get_by_finance_user(p_finance_user_id);
end;
$$;

update public.user_roles ur
set role = 'blocked'::public.user_role,
    updated_at = now()
from security.finance_access_grants g
left join security.finance_biometric_enrollments b on b.access_grant_id = g.id
where ur.user_id = g.finance_user_id
  and (g.status <> 'active' or coalesce(b.status, 'required') <> 'active');

revoke all on function public.finance_access_get_by_finance_user(uuid) from public, anon, authenticated;
revoke all on function public.finance_access_get_by_identity(uuid,text) from public, anon, authenticated;
revoke all on function public.finance_bind_intranet_identity(uuid,uuid,text) from public, anon, authenticated;
revoke all on function public.finance_touch_access(uuid) from public, anon, authenticated;
revoke all on function public.finance_list_access(uuid) from public, anon, authenticated;
revoke all on function public.finance_assign_master(uuid,uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.finance_grant_access(uuid,uuid,uuid,text,text,text,text) from public, anon, authenticated;
revoke all on function public.finance_change_access_status(uuid,uuid,text,text) from public, anon, authenticated;
revoke all on function public.finance_biometric_get_status(uuid) from public, anon, authenticated;
revoke all on function public.finance_biometric_begin(uuid,text,jsonb,timestamptz) from public, anon, authenticated;
revoke all on function public.finance_biometric_complete_enrollment(uuid,uuid,text,text,text,text,text,text,integer,numeric,text,jsonb,jsonb) from public, anon, authenticated;

grant execute on function public.finance_access_get_by_finance_user(uuid) to service_role;
grant execute on function public.finance_access_get_by_identity(uuid,text) to service_role;
grant execute on function public.finance_bind_intranet_identity(uuid,uuid,text) to service_role;
grant execute on function public.finance_touch_access(uuid) to service_role;
grant execute on function public.finance_list_access(uuid) to service_role;
grant execute on function public.finance_assign_master(uuid,uuid,uuid,text,text) to service_role;
grant execute on function public.finance_grant_access(uuid,uuid,uuid,text,text,text,text) to service_role;
grant execute on function public.finance_change_access_status(uuid,uuid,text,text) to service_role;
grant execute on function public.finance_biometric_get_status(uuid) to service_role;
grant execute on function public.finance_biometric_begin(uuid,text,jsonb,timestamptz) to service_role;
grant execute on function public.finance_biometric_complete_enrollment(uuid,uuid,text,text,text,text,text,text,integer,numeric,text,jsonb,jsonb) to service_role;
