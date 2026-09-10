-- Tags de journée du calendrier.
-- Les tags par défaut des samedis sont générés côté calendrier ;
-- cette table permet aux admins de les personnaliser et de les conserver.

create table if not exists public.calendar_day_tags (
    day date primary key,
    tags text[] not null default '{}',
    updated_by uuid references public.profiles(id) on delete set null,
    updated_at timestamptz not null default now()
);

create or replace function public.is_admin()
returns boolean
language sql
security definer
stable
set search_path = ''
as $$
    select exists (
        select 1
        from public.profiles
        where id = (select auth.uid())
          and role = 'admin'
    );
$$;

revoke all on function public.is_admin() from public, anon;
grant execute on function public.is_admin() to authenticated;

grant select on public.calendar_day_tags to anon, authenticated;
grant insert, update, delete on public.calendar_day_tags to authenticated;

alter table public.calendar_day_tags enable row level security;

drop policy if exists "Anyone can view calendar day tags" on public.calendar_day_tags;
create policy "Anyone can view calendar day tags"
on public.calendar_day_tags
for select
to anon, authenticated
using (true);

drop policy if exists "Admins can insert calendar day tags" on public.calendar_day_tags;
create policy "Admins can insert calendar day tags"
on public.calendar_day_tags
for insert
to authenticated
with check (public.is_admin() and updated_by = (select auth.uid()));

drop policy if exists "Admins can update calendar day tags" on public.calendar_day_tags;
create policy "Admins can update calendar day tags"
on public.calendar_day_tags
for update
to authenticated
using (public.is_admin())
with check (public.is_admin() and updated_by = (select auth.uid()));

drop policy if exists "Admins can delete calendar day tags" on public.calendar_day_tags;
create policy "Admins can delete calendar day tags"
on public.calendar_day_tags
for delete
to authenticated
using (public.is_admin());

-- Permet la mise à jour temps réel des tags si Realtime est utilisé.
alter publication supabase_realtime add table public.calendar_day_tags;
