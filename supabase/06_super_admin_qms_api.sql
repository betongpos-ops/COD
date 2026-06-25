-- Super Admin for guarded QMS API URL setting.
-- Run this file in Supabase SQL Editor.
-- Before running, replace CHANGE_ME_SUPER_ADMIN_PASSWORD with your real Super Admin password.

create extension if not exists pgcrypto;

create table if not exists public.super_admins (
  id uuid primary key default gen_random_uuid(),
  username text not null unique,
  password_hash text not null,
  is_active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

alter table public.super_admins enable row level security;

revoke all on table public.super_admins from anon, authenticated;

insert into public.super_admins (username, password_hash, is_active)
values ('admin', crypt('CHANGE_ME_SUPER_ADMIN_PASSWORD', gen_salt('bf')), true)
on conflict (username) do update
set password_hash = excluded.password_hash,
    is_active = true,
    updated_at = now();

create or replace function public.verify_super_admin(
  p_username text,
  p_password text
)
returns boolean
language plpgsql
security definer
set search_path = public, extensions
as $$
declare
  v_password_hash text;
begin
  select password_hash
    into v_password_hash
  from public.super_admins
  where username = p_username
    and is_active = true;

  if v_password_hash is null then
    return false;
  end if;

  return v_password_hash = crypt(p_password, v_password_hash);
end;
$$;

revoke all on function public.verify_super_admin(text, text) from public;
grant execute on function public.verify_super_admin(text, text) to anon, authenticated;
