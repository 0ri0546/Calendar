-- Journal administrateur V3
-- Audit métier centralisé des actions importantes du site.
-- A exécuter après les migrations existantes du projet.

alter table public.admin_logs drop constraint if exists admin_logs_action_check;
alter table public.admin_logs add constraint admin_logs_action_check check (action = any (array[
  'activity_created','activity_approved','activity_rejected','activity_updated','activity_deleted','activity_status_changed',
  'activity_joined','activity_left','activity_waitlist_joined','activity_waitlist_left',
  'day_presence_added','day_presence_removed',
  'friend_request_sent','friend_request_accepted','friend_request_rejected',
  'calendar_day_tags_updated','profile_updated',
  'user_promoted','user_demoted','notification_created','notification_sent','notification_failed'
]));

alter table public.admin_logs drop constraint if exists admin_logs_target_type_check;
alter table public.admin_logs add constraint admin_logs_target_type_check check (target_type = any (array[
  'activity','user','notification','calendar_day'
]));

-- Helper interne des triggers. Il ne vérifie pas le rôle : un membre doit
-- pouvoir déclencher l'audit de sa propre participation / présence / demande d'ami.
create or replace function public.write_audit_log(
  p_action text,
  p_target_type text,
  p_target_id uuid,
  p_details jsonb default '{}'::jsonb,
  p_actor_id uuid default null
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
declare v_log_id uuid; v_actor_id uuid;
begin
  v_actor_id := coalesce(p_actor_id, (select auth.uid()));
  insert into public.admin_logs(actor_id,action,target_type,target_id,details)
  values(v_actor_id,p_action,p_target_type,p_target_id,coalesce(p_details,'{}'::jsonb))
  returning id into v_log_id;
  return v_log_id;
end;
$$;
revoke all on function public.write_audit_log(text,text,uuid,jsonb,uuid) from public,anon,authenticated;

-- API explicite réservée aux administrateurs.
create or replace function public.log_admin_action(
  p_action text, p_target_type text, p_target_id uuid, p_details jsonb default '{}'::jsonb
)
returns uuid
language plpgsql security definer set search_path = ''
as $$
begin
  if (select auth.uid()) is null then raise exception 'You must be logged in'; end if;
  if not exists (select 1 from public.profiles where id=(select auth.uid()) and role='admin') then
    raise exception 'You must be an administrator';
  end if;
  return public.write_audit_log(p_action,p_target_type,p_target_id,p_details,(select auth.uid()));
end;
$$;
revoke all on function public.log_admin_action(text,text,uuid,jsonb) from public,anon,authenticated;

-- Activités : création, modification, suppression et changements de statut.
create or replace function public.audit_activity_changes()
returns trigger
language plpgsql security definer set search_path = ''
as $$
declare v_actor uuid := (select auth.uid());
begin
  if tg_op='INSERT' then
    perform public.write_audit_log('activity_created','activity',new.id,jsonb_build_object(
      'title',new.title,'date',new.date,'activity_type',new.activity_type,'status',new.status,
      'location',new.location,'is_event',new.is_event,'created_by',new.created_by),coalesce(v_actor,new.created_by));
    return new;
  end if;
  if tg_op='UPDATE' then
    -- approve_activity/reject_activity journalisent déjà ces deux transitions.
    if old.status is distinct from new.status then
      if old.status='pending' and new.status in ('approved','rejected') then return new; end if;
      perform public.write_audit_log('activity_status_changed','activity',new.id,jsonb_build_object(
        'title',new.title,'old_status',old.status,'new_status',new.status,'created_by',new.created_by),coalesce(v_actor,new.created_by));
    elsif row(old.title,old.description,old.date,old.start_time,old.end_time,old.min_players,old.max_players,old.location,old.is_event,old.image_url,old.activity_type)
      is distinct from row(new.title,new.description,new.date,new.start_time,new.end_time,new.min_players,new.max_players,new.location,new.is_event,new.image_url,new.activity_type) then
      perform public.write_audit_log('activity_updated','activity',new.id,jsonb_build_object(
        'title',new.title,'date',new.date,'start_time',new.start_time,'end_time',new.end_time,
        'old',jsonb_build_object('title',old.title,'description',old.description,'date',old.date,'start_time',old.start_time,'end_time',old.end_time,'min_players',old.min_players,'max_players',old.max_players,'location',old.location,'is_event',old.is_event,'image_url',old.image_url),
        'new',jsonb_build_object('title',new.title,'description',new.description,'date',new.date,'start_time',new.start_time,'end_time',new.end_time,'min_players',new.min_players,'max_players',new.max_players,'location',new.location,'is_event',new.is_event,'image_url',new.image_url),
        'created_by',new.created_by),coalesce(v_actor,new.created_by));
    end if;
    return new;
  end if;
  perform public.write_audit_log('activity_deleted','activity',old.id,jsonb_build_object(
    'title',old.title,'description',old.description,'date',old.date,'start_time',old.start_time,'end_time',old.end_time,
    'activity_type',old.activity_type,'location',old.location,'is_event',old.is_event,'created_by',old.created_by),coalesce(v_actor,old.created_by));
  return old;
end;
$$;
drop trigger if exists trg_audit_activities on public.activities;
create trigger trg_audit_activities after insert or update or delete on public.activities for each row execute function public.audit_activity_changes();
revoke all on function public.audit_activity_changes() from public,anon,authenticated;

-- Participations aux activités.
create or replace function public.audit_participation_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_activity uuid; v_title text; v_actor uuid;
begin
  v_user:=case when tg_op='DELETE' then old.user_id else new.user_id end;
  v_activity:=case when tg_op='DELETE' then old.activity_id else new.activity_id end;
  v_actor:=coalesce((select auth.uid()),v_user);
  select title into v_title from public.activities where id=v_activity;
  perform public.write_audit_log(case when tg_op='DELETE' then 'activity_left' else 'activity_joined' end,'activity',v_activity,
    jsonb_build_object('title',v_title,'user_id',v_user,'joined_at',case when tg_op='DELETE' then old.joined_at else new.joined_at end),v_actor);
  return case when tg_op='DELETE' then old else new end;
end; $$;
drop trigger if exists trg_audit_participations on public.participations;
create trigger trg_audit_participations after insert or delete on public.participations for each row execute function public.audit_participation_changes();
revoke all on function public.audit_participation_changes() from public,anon,authenticated;

-- Entrées / sorties de file d'attente.
create or replace function public.audit_follower_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_activity uuid; v_title text; v_actor uuid;
begin
  v_user:=case when tg_op='DELETE' then old.user_id else new.user_id end;
  v_activity:=case when tg_op='DELETE' then old.activity_id else new.activity_id end;
  v_actor:=coalesce((select auth.uid()),v_user);
  select title into v_title from public.activities where id=v_activity;
  perform public.write_audit_log(case when tg_op='DELETE' then 'activity_waitlist_left' else 'activity_waitlist_joined' end,'activity',v_activity,
    jsonb_build_object('title',v_title,'user_id',v_user),v_actor);
  return case when tg_op='DELETE' then old else new end;
end; $$;
drop trigger if exists trg_audit_followers on public.followers;
create trigger trg_audit_followers after insert or delete on public.followers for each row execute function public.audit_follower_changes();
revoke all on function public.audit_follower_changes() from public,anon,authenticated;

-- Demandes d'amis : envoi, acceptation et refus.
create or replace function public.audit_friend_request_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_actor uuid := (select auth.uid()); v_target uuid; v_requester_pseudo text; v_addressee_pseudo text;
begin
  if tg_op='INSERT' then
    v_target:=new.addressee_id;
    select pseudo into v_addressee_pseudo from public.profiles where id=new.addressee_id;
    perform public.write_audit_log('friend_request_sent','user',v_target,jsonb_build_object(
      'request_id',new.id,'requester_id',new.requester_id,'addressee_id',new.addressee_id,'target_pseudo',v_addressee_pseudo),coalesce(v_actor,new.requester_id));
    return new;
  end if;
  if old.status is distinct from new.status and new.status in ('accepted','rejected') then
    v_target:=new.requester_id;
    select pseudo into v_requester_pseudo from public.profiles where id=new.requester_id;
    select pseudo into v_addressee_pseudo from public.profiles where id=new.addressee_id;
    perform public.write_audit_log(case when new.status='accepted' then 'friend_request_accepted' else 'friend_request_rejected' end,
      'user',v_target,jsonb_build_object('request_id',new.id,'requester_id',new.requester_id,'addressee_id',new.addressee_id,
      'requester_pseudo',v_requester_pseudo,'addressee_pseudo',v_addressee_pseudo),coalesce(v_actor,new.addressee_id));
  end if;
  return new;
end; $$;
drop trigger if exists trg_audit_friend_requests on public.friend_requests;
create trigger trg_audit_friend_requests after insert or update on public.friend_requests for each row execute function public.audit_friend_request_changes();
revoke all on function public.audit_friend_request_changes() from public,anon,authenticated;

-- Présence aux jeux divers.
create or replace function public.audit_day_presence_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_user uuid; v_day date;
begin
  v_user:=case when tg_op='DELETE' then old.user_id else new.user_id end;
  v_day:=case when tg_op='DELETE' then old.day else new.day end;
  perform public.write_audit_log(case when tg_op='DELETE' then 'day_presence_removed' else 'day_presence_added' end,'user',v_user,
    jsonb_build_object('day',v_day,'user_id',v_user),coalesce((select auth.uid()),v_user));
  return case when tg_op='DELETE' then old else new end;
end; $$;
drop trigger if exists trg_audit_day_presence on public.day_presence;
create trigger trg_audit_day_presence after insert or delete on public.day_presence for each row execute function public.audit_day_presence_changes();
revoke all on function public.audit_day_presence_changes() from public,anon,authenticated;

-- Tags de journée modifiés par un administrateur.
create or replace function public.audit_calendar_day_tag_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
declare v_day date; v_actor uuid; v_old text[]; v_new text[];
begin
  v_day:=case when tg_op='DELETE' then old.day else new.day end;
  v_actor:=coalesce((select auth.uid()),case when tg_op='DELETE' then old.updated_by else new.updated_by end);
  v_old:=case when tg_op='INSERT' then '{}'::text[] else old.tags end;
  v_new:=case when tg_op='DELETE' then '{}'::text[] else new.tags end;
  perform public.write_audit_log('calendar_day_tags_updated','calendar_day',null,jsonb_build_object(
    'day',v_day,'old_tags',v_old,'new_tags',v_new,'updated_by',case when tg_op='DELETE' then old.updated_by else new.updated_by end),v_actor);
  return case when tg_op='DELETE' then old else new end;
end; $$;
drop trigger if exists trg_audit_calendar_day_tags on public.calendar_day_tags;
create trigger trg_audit_calendar_day_tags after insert or update or delete on public.calendar_day_tags for each row execute function public.audit_calendar_day_tag_changes();
revoke all on function public.audit_calendar_day_tag_changes() from public,anon,authenticated;

-- Profil : pseudo/avatar/code ami. Les changements de rôle restent journalisés
-- par set_user_role() pour éviter un doublon.
create or replace function public.audit_profile_changes()
returns trigger language plpgsql security definer set search_path = '' as $$
begin
  if row(old.pseudo,old.avatar_url,old.friend_code) is distinct from row(new.pseudo,new.avatar_url,new.friend_code) then
    perform public.write_audit_log('profile_updated','user',new.id,jsonb_build_object(
      'user_id',new.id,
      'old',jsonb_build_object('pseudo',old.pseudo,'avatar_url',old.avatar_url,'friend_code',old.friend_code),
      'new',jsonb_build_object('pseudo',new.pseudo,'avatar_url',new.avatar_url,'friend_code',new.friend_code)),coalesce((select auth.uid()),new.id));
  end if;
  return new;
end; $$;
drop trigger if exists trg_audit_profile_changes on public.profiles;
create trigger trg_audit_profile_changes after update on public.profiles for each row execute function public.audit_profile_changes();
revoke all on function public.audit_profile_changes() from public,anon,authenticated;
