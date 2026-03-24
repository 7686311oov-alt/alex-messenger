-- Alex hardening migration
-- Creates profiles + audit logs + RLS required by admin edge functions.

begin;

create extension if not exists pgcrypto;

-- Profiles linked to auth.users
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  username text unique not null,
  is_admin boolean not null default false,
  created_at timestamptz not null default now()
);

-- Optional audit table used by functions/_shared/admin.ts
create table if not exists public.audit_logs (
  id bigint generated always as identity primary key,
  actor_id uuid references public.profiles(id) on delete set null,
  action text not null,
  payload jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);

create index if not exists idx_profiles_username on public.profiles(username);
create index if not exists idx_audit_logs_actor_id on public.audit_logs(actor_id);
create index if not exists idx_audit_logs_created_at on public.audit_logs(created_at desc);

-- Auto-create profile row when new auth user is created.
create or replace function public.handle_new_auth_user()
returns trigger
language plpgsql
security definer
set search_path = public
as $$
declare
  v_username text;
begin
  v_username := nullif(trim(new.raw_user_meta_data ->> 'username'), '');
  if v_username is null then
    v_username := split_part(new.email, '@', 1);
  end if;

  insert into public.profiles (id, username, is_admin, created_at)
  values (new.id, v_username, false, now())
  on conflict (id) do update
    set username = excluded.username;

  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
after insert on auth.users
for each row execute function public.handle_new_auth_user();

alter table public.profiles enable row level security;
alter table public.audit_logs enable row level security;

-- Profiles policies
drop policy if exists "profiles_select_authenticated" on public.profiles;
create policy "profiles_select_authenticated"
on public.profiles
for select
to authenticated
using (true);

drop policy if exists "profiles_update_own_row" on public.profiles;
create policy "profiles_update_own_row"
on public.profiles
for update
to authenticated
using (auth.uid() = id)
with check (auth.uid() = id);

-- No direct insert/delete from clients into profiles
drop policy if exists "profiles_insert_none" on public.profiles;
create policy "profiles_insert_none"
on public.profiles
for insert
to authenticated
with check (false);

drop policy if exists "profiles_delete_none" on public.profiles;
create policy "profiles_delete_none"
on public.profiles
for delete
to authenticated
using (false);

-- Audit logs policies
drop policy if exists "audit_logs_admin_read" on public.audit_logs;
create policy "audit_logs_admin_read"
on public.audit_logs
for select
to authenticated
using (
  exists (
    select 1
    from public.profiles p
    where p.id = auth.uid()
      and p.is_admin = true
  )
);

drop policy if exists "audit_logs_no_client_write" on public.audit_logs;
create policy "audit_logs_no_client_write"
on public.audit_logs
for all
to authenticated
using (false)
with check (false);

commit;
