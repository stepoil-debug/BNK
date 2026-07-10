-- STEP Finance Control
-- Supabase separado para o cofre financeiro.
-- Execute este SQL no novo projeto Supabase antes de subir o app.

create extension if not exists pgcrypto;

-- Tipos controlados
create type public.user_role as enum ('super_admin', 'admin', 'finance_editor', 'finance_viewer', 'auditor', 'blocked');
create type public.device_status as enum ('pending', 'approved', 'blocked');
create type public.position_status as enum ('draft', 'published', 'archived');
create type public.security_event_level as enum ('info', 'warning', 'critical');
create type public.finance_group as enum ('bank_accounts', 'investments', 'credit_cards', 'credit_lines', 'companies');

-- Perfil do usuário
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  status text not null default 'active' check (status in ('active', 'inactive', 'blocked')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.user_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role public.user_role not null default 'finance_viewer',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Dispositivo aprovado por usuário
create table if not exists public.approved_devices (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  fingerprint_hash text not null,
  label text,
  user_agent text,
  platform text,
  browser_language text,
  timezone text,
  screen_resolution text,
  ip_address text,
  status public.device_status not null default 'pending',
  approved_by uuid references auth.users(id),
  approved_at timestamptz,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(user_id, fingerprint_hash)
);

-- Logs de segurança e auditoria
create table if not exists public.security_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users(id) on delete set null,
  event_type text not null,
  level public.security_event_level not null default 'info',
  ip_address text,
  fingerprint_hash text,
  user_agent text,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

-- Passkey/WebAuthn: estrutura pronta para biometria nativa do aparelho.
create table if not exists public.webauthn_challenges (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  challenge text not null,
  flow text not null check (flow in ('registration', 'authentication')),
  expires_at timestamptz not null default (now() + interval '5 minutes'),
  created_at timestamptz not null default now()
);

create table if not exists public.webauthn_credentials (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  credential_id text not null unique,
  public_key text not null,
  counter bigint not null default 0,
  transports text[],
  device_name text,
  created_at timestamptz not null default now(),
  last_used_at timestamptz
);

-- Templates dos campos financeiros. A planilha vira cadastro flexível, não colunas fixas.
create table if not exists public.finance_field_templates (
  id uuid primary key default gen_random_uuid(),
  group_key public.finance_group not null,
  item_name text not null,
  bank_name text,
  account_type text,
  account_number text,
  company_name text,
  is_active boolean not null default true,
  order_index int not null default 0,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.finance_positions (
  id uuid primary key default gen_random_uuid(),
  reference_date date not null,
  status public.position_status not null default 'draft',
  notes text,
  created_by uuid not null references auth.users(id),
  published_by uuid references auth.users(id),
  published_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(reference_date, status) deferrable initially immediate
);

create table if not exists public.finance_position_items (
  id uuid primary key default gen_random_uuid(),
  position_id uuid not null references public.finance_positions(id) on delete cascade,
  field_template_id uuid not null references public.finance_field_templates(id),
  amount numeric(15,2) not null default 0,
  notes text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(position_id, field_template_id)
);

create table if not exists public.finance_imports (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id),
  file_name text not null,
  file_type text,
  status text not null default 'pending' check (status in ('pending', 'processing', 'completed', 'failed')),
  rows_detected int default 0,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

-- Funções auxiliares
create or replace function public.is_admin()
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and role in ('super_admin', 'admin')
  );
$$;

create or replace function public.has_any_role(roles public.user_role[])
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.user_roles
    where user_id = auth.uid()
      and role = any(roles)
  );
$$;

create or replace function public.current_user_role()
returns public.user_role
language sql
stable
security definer
set search_path = public
as $$
  select role from public.user_roles where user_id = auth.uid() limit 1;
$$;

create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name)
  values (new.id, coalesce(new.email, ''), coalesce(new.raw_user_meta_data->>'full_name', ''))
  on conflict (id) do nothing;

  insert into public.user_roles (user_id, role)
  values (new.id, 'finance_viewer')
  on conflict (user_id) do nothing;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created_step_finance on auth.users;
create trigger on_auth_user_created_step_finance
  after insert on auth.users
  for each row execute function public.handle_new_user();

create or replace function public.touch_updated_at()
returns trigger
language plpgsql
as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

create trigger trg_profiles_updated before update on public.profiles for each row execute function public.touch_updated_at();
create trigger trg_user_roles_updated before update on public.user_roles for each row execute function public.touch_updated_at();
create trigger trg_devices_updated before update on public.approved_devices for each row execute function public.touch_updated_at();
create trigger trg_field_templates_updated before update on public.finance_field_templates for each row execute function public.touch_updated_at();
create trigger trg_positions_updated before update on public.finance_positions for each row execute function public.touch_updated_at();
create trigger trg_position_items_updated before update on public.finance_position_items for each row execute function public.touch_updated_at();

-- Views do dashboard
create or replace view public.v_latest_published_position
with (security_invoker = true)
as
select *
from public.finance_positions
where status = 'published'
order by reference_date desc, published_at desc nulls last
limit 1;

create or replace view public.v_dashboard_totals
with (security_invoker = true)
as
select
  p.id as position_id,
  p.reference_date,
  coalesce(sum(i.amount) filter (where t.group_key = 'bank_accounts'), 0) as total_banks,
  coalesce(sum(i.amount) filter (where t.group_key = 'investments'), 0) as total_investments,
  coalesce(sum(i.amount) filter (where t.group_key = 'credit_cards'), 0) as total_credit_cards_available,
  coalesce(sum(i.amount) filter (where t.group_key = 'credit_lines'), 0) as total_credit_lines,
  coalesce(sum(i.amount) filter (where t.group_key = 'companies'), 0) as total_companies,
  coalesce(sum(i.amount), 0) as total_general
from public.finance_positions p
left join public.finance_position_items i on i.position_id = p.id
left join public.finance_field_templates t on t.id = i.field_template_id
where p.status = 'published'
group by p.id, p.reference_date;

-- RLS
alter table public.profiles enable row level security;
alter table public.user_roles enable row level security;
alter table public.approved_devices enable row level security;
alter table public.security_events enable row level security;
alter table public.webauthn_challenges enable row level security;
alter table public.webauthn_credentials enable row level security;
alter table public.finance_field_templates enable row level security;
alter table public.finance_positions enable row level security;
alter table public.finance_position_items enable row level security;
alter table public.finance_imports enable row level security;

-- Profiles
create policy "profiles_select_own_or_admin" on public.profiles for select using (id = auth.uid() or public.is_admin());
create policy "profiles_update_own_or_admin" on public.profiles for update using (id = auth.uid() or public.is_admin()) with check (id = auth.uid() or public.is_admin());

-- Roles
create policy "roles_select_own_or_admin" on public.user_roles for select using (user_id = auth.uid() or public.is_admin());
create policy "roles_admin_all" on public.user_roles for all using (public.is_admin()) with check (public.is_admin());

-- Devices
create policy "devices_select_own_or_admin" on public.approved_devices for select using (user_id = auth.uid() or public.is_admin());
create policy "devices_insert_own_pending" on public.approved_devices for insert with check (user_id = auth.uid() and status = 'pending');
create policy "devices_update_admin" on public.approved_devices for update using (public.is_admin()) with check (public.is_admin());

-- Security events
create policy "security_events_insert_authenticated" on public.security_events for insert with check (auth.uid() is not null);
create policy "security_events_select_admin" on public.security_events for select using (public.is_admin());

-- WebAuthn tables: Edge Functions usam service role. Usuário pode ler próprios credenciais.
create policy "webauthn_credentials_select_own" on public.webauthn_credentials for select using (user_id = auth.uid());
create policy "webauthn_challenges_select_own" on public.webauthn_challenges for select using (user_id = auth.uid());

-- Finance templates
create policy "finance_templates_read_allowed" on public.finance_field_templates for select using (public.has_any_role(array['super_admin','admin','finance_editor','finance_viewer','auditor']::public.user_role[]));
create policy "finance_templates_admin_write" on public.finance_field_templates for all using (public.is_admin()) with check (public.is_admin());

-- Finance positions
create policy "finance_positions_read_allowed" on public.finance_positions for select using (public.has_any_role(array['super_admin','admin','finance_editor','finance_viewer','auditor']::public.user_role[]));
create policy "finance_positions_write_editors" on public.finance_positions for insert with check (public.has_any_role(array['super_admin','admin','finance_editor']::public.user_role[]) and created_by = auth.uid());
create policy "finance_positions_update_editors" on public.finance_positions for update using (public.has_any_role(array['super_admin','admin','finance_editor']::public.user_role[])) with check (public.has_any_role(array['super_admin','admin','finance_editor']::public.user_role[]));

-- Finance items
create policy "finance_items_read_allowed" on public.finance_position_items for select using (public.has_any_role(array['super_admin','admin','finance_editor','finance_viewer','auditor']::public.user_role[]));
create policy "finance_items_write_editors" on public.finance_position_items for insert with check (public.has_any_role(array['super_admin','admin','finance_editor']::public.user_role[]));
create policy "finance_items_update_editors" on public.finance_position_items for update using (public.has_any_role(array['super_admin','admin','finance_editor']::public.user_role[])) with check (public.has_any_role(array['super_admin','admin','finance_editor']::public.user_role[]));

-- Imports
create policy "finance_imports_read_allowed" on public.finance_imports for select using (user_id = auth.uid() or public.has_any_role(array['super_admin','admin','finance_editor','finance_viewer','auditor']::public.user_role[]));
create policy "finance_imports_insert_own" on public.finance_imports for insert with check (user_id = auth.uid());
create policy "finance_imports_update_editors" on public.finance_imports for update using (public.has_any_role(array['super_admin','admin','finance_editor']::public.user_role[])) with check (public.has_any_role(array['super_admin','admin','finance_editor']::public.user_role[]));

-- Seeds dos campos da planilha enviada. Totais são calculados pelo sistema, não digitados.
insert into public.finance_field_templates (group_key, item_name, bank_name, account_type, account_number, company_name, order_index) values
('bank_accounts','Banco Santander - CC 13001900-7','Santander','Conta Corrente','13001900-7',null,10),
('bank_accounts','Banco Itaú - AG 8785 CC 00768-6','Itaú','Conta Corrente','00768-6',null,20),
('bank_accounts','Banco Bradesco - CC 5250-7','Bradesco','Conta Corrente','5250-7',null,30),
('bank_accounts','Banco Caixa Econômica - CC 3579-6','Caixa Econômica','Conta Corrente','3579-6',null,40),
('investments','Banco Santander - Investimento','Santander','Investimento','13001900-7',null,50),
('investments','Banco Itaú - Investimento','Itaú','Investimento','00768-6',null,60),
('credit_cards','Cartão Crédito Itaú 9968','Itaú','Cartão de Crédito','9968',null,70),
('credit_cards','Cartão Crédito Bradesco 4212','Bradesco','Cartão de Crédito','4212',null,80),
('credit_cards','Cartão Crédito Bradesco 1735','Bradesco','Cartão de Crédito','1735',null,90),
('credit_cards','Cartão Crédito Santander 2885','Santander','Cartão de Crédito','2885',null,100),
('credit_cards','Cartão Crédito Santander 7164','Santander','Cartão de Crédito','7164',null,110),
('credit_cards','Cartão Crédito Santander 2542','Santander','Cartão de Crédito','2542',null,120),
('credit_lines','Linha Crédito Santander CC 13001900-7 - 500k','Santander','Linha de Crédito','13001900-7',null,130),
('credit_lines','Santander CC 13001900-7 - Cheque Especial 100','Santander','Cheque Especial','13001900-7',null,140),
('credit_lines','Santander CC 13001900-7 - Conta Garantida 8 mi','Santander','Conta Garantida','13001900-7',null,150),
('credit_lines','Banco Santander 29000059-6','Santander','Linha de Crédito','29000059-6',null,160),
('credit_lines','Itaú - Linha Crédito Cheque Especial 234k','Itaú','Cheque Especial',null,null,170),
('credit_lines','LIS Itaú','Itaú','LIS',null,null,180),
('credit_lines','Itaú - Conta Garantida 4 mi','Itaú','Conta Garantida',null,null,190),
('credit_lines','Bradesco - Cheque Especial 10k','Bradesco','Cheque Especial',null,null,200),
('credit_lines','Bradesco - Limite Rotativo Flex','Bradesco','Limite Rotativo',null,null,210),
('credit_lines','Banco Caixa Econômica - Linha Crédito','Caixa Econômica','Linha de Crédito',null,null,220),
('companies','Step-Energy Itaú','Itaú','Conta Empresa',null,'Step-Energy',230),
('companies','Step-Energy Santander','Santander','Conta Empresa',null,'Step-Energy',240),
('companies','Step-Energy LIS Santander','Santander','LIS',null,'Step-Energy',250),
('companies','Step-Energy LIS Itaú','Itaú','LIS',null,'Step-Energy',260),
('companies','Petrohab Santander','Santander','Conta Empresa',null,'Petrohab',270),
('companies','Petrohab Santander LIS','Santander','LIS',null,'Petrohab',280)
on conflict do nothing;

-- Para transformar seu usuário inicial em Super Admin:
-- update public.user_roles set role = 'super_admin' where user_id = '<SEU_USER_ID>';
