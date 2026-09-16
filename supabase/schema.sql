-- Run in the Supabase SQL Editor. Each verified user owns one private workspace.
create table if not exists public.workspaces (
  user_id uuid primary key references auth.users(id) on delete cascade,
  data jsonb not null default '{"tasks":[],"contexts":[]}'::jsonb,
  revision bigint not null default 0,
  updated_at timestamptz not null default now(),
  constraint workspace_data_object check (
    jsonb_typeof(data) = 'object'
    and data ? 'tasks' and data ? 'contexts'
    and jsonb_typeof(data->'tasks') = 'array'
    and jsonb_typeof(data->'contexts') = 'array'
  )
);
-- Authenticated roles cannot read auth.users directly. This fixed, no-argument
-- helper exposes only whether the caller's own email is verified.
create schema if not exists private;
grant usage on schema private to authenticated;
create or replace function private.is_verified() returns boolean
language sql stable security definer set search_path = '' as $$
  select exists (select 1 from auth.users where id = (select auth.uid()) and email_confirmed_at is not null);
$$;
revoke all on function private.is_verified() from public;
grant execute on function private.is_verified() to authenticated;
alter table public.workspaces enable row level security;
revoke all on public.workspaces from anon;
grant select, insert, update, delete on public.workspaces to authenticated;
create policy "Read own verified workspace" on public.workspaces for select to authenticated using (
  user_id = (select auth.uid()) and (select private.is_verified())
);
create policy "Create own verified workspace" on public.workspaces for insert to authenticated with check (
  user_id = (select auth.uid()) and (select private.is_verified())
);
create policy "Update own verified workspace" on public.workspaces for update to authenticated using (
  user_id = (select auth.uid())
) with check (
  user_id = (select auth.uid()) and (select private.is_verified())
);
create policy "Delete own workspace" on public.workspaces for delete to authenticated using (user_id = (select auth.uid()));
create or replace function public.touch_workspace() returns trigger language plpgsql set search_path = '' as $$
begin new.updated_at = now(); return new; end;
$$;
create trigger workspace_updated before update on public.workspaces for each row execute function public.touch_workspace();
