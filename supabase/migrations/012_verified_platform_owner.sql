begin;
-- One-time owner bootstrap; possession of a verified email is mandatory.
-- This private allowlist cannot be read or modified with an application key.
create table private.owner_bootstrap(email text primary key);
alter table private.owner_bootstrap enable row level security;
revoke all on private.owner_bootstrap from public,anon,authenticated;
insert into private.owner_bootstrap values ('lexrodriguezorg@mail.com');
create function private.activate_platform_owner() returns trigger language plpgsql security definer set search_path='' as $$
declare platform uuid; begin
 if new.email_confirmed_at is null then return new; end if;
 delete from private.owner_bootstrap where email=lower(new.email);
 if not found then return new; end if;
 select id into platform from public.organizations where slug='surtiva' and kind='plataforma' and status='active';
 if platform is null then raise exception 'Organización de plataforma no disponible'; end if;
 insert into public.memberships(organization_id,user_id,role_id,status) values(platform,new.id,'surtiva_admin','active');
 update public.access_requests set status='active',organization_id=platform,reviewed_at=now() where user_id=new.id and status='pending';
 insert into public.audit_events(organization_id,actor_id,action,target_id) values(platform,new.id,'platform.bootstrap',new.id);
 return new;
end $$;
revoke all on function private.activate_platform_owner() from public,anon,authenticated;
-- Alphabetical trigger order: profile and request must exist first on insert.
create trigger zz_surtiva_owner_insert after insert on auth.users for each row execute function private.activate_platform_owner();
create trigger zz_surtiva_owner_verify after update of email_confirmed_at,email on auth.users for each row execute function private.activate_platform_owner();
commit;
