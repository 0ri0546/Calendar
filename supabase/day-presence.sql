-- Présence aux jeux divers : une ligne par utilisateur et par journée.
create table if not exists public.day_presence (
    day date not null,
    user_id uuid not null references public.profiles(id) on delete cascade,
    created_at timestamptz not null default now(),
    primary key (day, user_id)
);

create index if not exists day_presence_user_id_idx
    on public.day_presence(user_id);

alter table public.day_presence enable row level security;

grant select, insert, delete on public.day_presence to authenticated;

drop policy if exists "Users can view own day presence" on public.day_presence;
create policy "Users can view own day presence"
on public.day_presence for select to authenticated
using (user_id = (select auth.uid()));

drop policy if exists "Admins can view all day presence" on public.day_presence;
create policy "Admins can view all day presence"
on public.day_presence for select to authenticated
using (public.is_admin());

drop policy if exists "Users can add own day presence" on public.day_presence;
create policy "Users can add own day presence"
on public.day_presence for insert to authenticated
with check (user_id = (select auth.uid()));

drop policy if exists "Users can remove own day presence" on public.day_presence;
create policy "Users can remove own day presence"
on public.day_presence for delete to authenticated
using (user_id = (select auth.uid()));

alter publication supabase_realtime add table public.day_presence;
