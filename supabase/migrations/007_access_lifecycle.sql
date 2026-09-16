begin;
create table public.invitations (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations,
 email text not null, name text not null, role_id text not null references public.roles,
 token_hash text not null unique, status text not null default 'pending' check(status in ('pending','active','suspended','rejected')),
 created_by uuid not null references public.profiles, created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '7 days',
 accepted_by uuid references public.profiles, check(role_id in ('seller','merchant','fulfillment_partner'))
);
alter table public.invitations enable row level security;
revoke all on public.invitations from anon,authenticated;
grant select(id,organization_id,email,name,role_id,status,created_at,expires_at,accepted_by) on public.invitations to authenticated;
create policy invitation_read on public.invitations for select to authenticated using(private.is_admin() or private.member_role(organization_id)='distributor_admin' or accepted_by=auth.uid());
alter table public.access_requests add column invitation_id uuid references public.invitations;

create function public.create_invitation(org uuid, recipient_email text, recipient_name text, requested_role text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invitation uuid; secret text:=gen_random_uuid()::text||gen_random_uuid()::text; begin
 if not (private.is_admin() or coalesce(private.member_role(org)='distributor_admin',false)) then raise exception 'No autorizado' using errcode='42501'; end if;
 if not exists(select 1 from public.organizations where id=org and kind='distribuidor' and status='active') then raise exception 'Distribuidor no disponible'; end if;
 if requested_role not in ('seller','merchant','fulfillment_partner') or requested_role is null then raise exception 'Rol inválido'; end if;
 if length(trim(coalesce(recipient_name,''))) not between 1 and 100 or coalesce(recipient_email,'') !~ '^[^\s@]+@[^\s@]+\.[^\s@]+$' or length(recipient_email)>254 then raise exception 'Nombre o correo inválido'; end if;
 insert into public.invitations(organization_id,email,name,role_id,token_hash,created_by)
 values(org,lower(trim(recipient_email)),trim(recipient_name),requested_role,encode(sha256(convert_to(secret,'UTF8')),'hex'),auth.uid()) returning id into invitation;
 insert into public.audit_events(organization_id,actor_id,action,target_id) values(org,auth.uid(),'invitation.create',invitation);
 return jsonb_build_object('id',invitation,'token',secret,'expiresInDays',7);
end $$;

create or replace function private.register_identity() returns trigger language plpgsql security definer set search_path='' as $$
declare requested text:=new.raw_user_meta_data->>'requested_role'; invitation public.invitations; begin
 -- Administrative Auth users can exist without an application request.
 insert into public.profiles(id,name) values(new.id,coalesce(nullif(left(trim(new.raw_user_meta_data->>'name'),100),''),'Usuario'));
 if requested is null then return new; end if;
 if requested not in ('distributor_admin','seller','merchant','fulfillment_partner') then raise exception 'Perfil solicitado inválido'; end if;
 if length(trim(coalesce(new.raw_user_meta_data->>'organization_name',''))) not between 1 and 120 then raise exception 'Nombre de organización inválido'; end if;
 if nullif(new.raw_user_meta_data->>'invitation_token','') is not null then
  select * into invitation from public.invitations where token_hash=encode(sha256(convert_to(new.raw_user_meta_data->>'invitation_token','UTF8')),'hex') and status='pending' and expires_at>now() for update;
  if not found or invitation.email<>lower(new.email) or invitation.role_id<>requested then raise exception 'Invitación inválida o vencida'; end if;
  update public.invitations set accepted_by=new.id where id=invitation.id;
 end if;
 insert into public.access_requests(user_id,organization_name,requested_role,invitation_id)
 values(new.id,trim(new.raw_user_meta_data->>'organization_name'),requested,invitation.id);
 return new;
end $$;

create or replace function public.review_access(request_id uuid, decision text, target_org uuid default null, assigned_role text default null, entity_id uuid default null, new_org_name text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.access_requests; org uuid:=target_org; chosen text; expected_kind text; seller_key uuid:=entity_id; invitation public.invitations; entity uuid; begin
 if not private.is_admin() then raise exception 'No autorizado' using errcode='42501'; end if;
 select * into r from public.access_requests where id=request_id for update;
 if not found or r.status<>'pending' then raise exception 'La solicitud ya fue revisada o no existe'; end if;
 if decision is null or decision not in ('aprobar','rechazar') then raise exception 'Decisión inválida'; end if;
 if r.invitation_id is not null then select * into invitation from public.invitations where id=r.invitation_id for update; end if;
 if decision='rechazar' then
  update public.access_requests set status='rejected',reviewed_by=auth.uid(),reviewed_at=now() where id=r.id;
  update public.invitations set status='rejected' where id=invitation.id;
 else
  if not exists(select 1 from auth.users where id=r.user_id and email_confirmed_at is not null) then raise exception 'El correo todavía no está verificado'; end if;
  chosen:=coalesce(assigned_role,r.requested_role);
  if chosen not in ('distributor_admin','seller','merchant','fulfillment_partner') then raise exception 'Rol inválido'; end if;
  expected_kind:=case chosen when 'merchant' then 'comercio' when 'fulfillment_partner' then 'cumplimiento' else 'distribuidor' end;
  if invitation.id is not null then
   if invitation.status<>'pending' or invitation.role_id<>chosen or invitation.accepted_by<>r.user_id then raise exception 'Invitación no disponible'; end if;
   if not exists(select 1 from public.organizations where id=invitation.organization_id and status='active') then raise exception 'La organización que invitó no está activa'; end if;
   if chosen='seller' then org:=invitation.organization_id; end if;
  end if;
  if org is null then
   if chosen='seller' then raise exception 'Selecciona el distribuidor del vendedor'; end if;
   org:=gen_random_uuid();
   insert into public.organizations(id,name,slug,kind,status) values(org,coalesce(nullif(trim(new_org_name),''),r.organization_name),'org-'||org,expected_kind,'active');
  end if;
  if not exists(select 1 from public.organizations where id=org and kind=expected_kind and status='active') then raise exception 'El rol no corresponde a una organización activa'; end if;
  if chosen='seller' and seller_key is null then
   insert into public.sellers(organization_id,name) select org,name from public.profiles where id=r.user_id returning id into seller_key;
  end if;
  insert into public.memberships(organization_id,user_id,role_id,status,seller_id) values(org,r.user_id,chosen,'active',case when chosen='seller' then seller_key end);
  if invitation.id is not null and chosen in ('merchant','fulfillment_partner') then
   insert into public.organization_relationships(organization_id,partner_organization_id,kind,status) values(invitation.organization_id,org,chosen,'active') on conflict(organization_id,partner_organization_id,kind) do update set status='active';
   if chosen='merchant' then
    insert into public.clients(organization_id,merchant_organization_id,name,status) select invitation.organization_id,org,name,'active' from public.organizations where id=org on conflict(organization_id,merchant_organization_id) do update set status='active';
   else
    insert into public.fulfillment_nodes(organization_id,name) select org,name from public.organizations where id=org and not exists(select 1 from public.fulfillment_nodes where organization_id=org);
   end if;
  end if;
  update public.invitations set status='active' where id=invitation.id;
  update public.access_requests set status='active',organization_id=org,reviewed_by=auth.uid(),reviewed_at=now() where id=r.id;
 end if;
 insert into public.audit_events(organization_id,actor_id,action,target_id) values(org,auth.uid(),'access.'||decision,r.id);
 return org;
end $$;

create function public.set_account_status(entity_kind text, entity_key uuid, new_status text) returns void language plpgsql security definer set search_path='' as $$
declare org uuid; begin
 if not private.is_admin() then raise exception 'No autorizado' using errcode='42501'; end if;
 if new_status is null or new_status not in ('pending','active','suspended','rejected') then raise exception 'Estado inválido'; end if;
 if entity_kind='organization' then
  if exists(select 1 from public.organizations where id=entity_key and kind='plataforma') then raise exception 'La plataforma no se suspende desde esta acción'; end if;
  update public.organizations set status=new_status where id=entity_key returning id into org;
 elsif entity_kind='membership' then
  if exists(select 1 from public.memberships where id=entity_key and role_id='surtiva_admin') then raise exception 'La administración global requiere revisión administrativa'; end if;
  update public.memberships set status=new_status where id=entity_key returning organization_id into org;
 else raise exception 'Entidad inválida'; end if;
 if org is null then raise exception 'Registro no encontrado'; end if;
 insert into public.audit_events(organization_id,actor_id,action,target_id) values(org,auth.uid(),entity_kind||'.'||new_status,entity_key);
end $$;
create or replace function public.set_membership_active(membership_id uuid, enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin perform public.set_account_status('membership',membership_id,case when enabled then 'active' else 'suspended' end); end $$;

create function public.set_organization_plan(org uuid, plan text) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.is_admin() then raise exception 'No autorizado' using errcode='42501'; end if;
 if not exists(select 1 from public.organization_plans where code=plan and active) then raise exception 'Plan no disponible'; end if;
 update public.organizations set plan_code=plan where id=org;
 if not found then raise exception 'Organización no encontrada'; end if;
 insert into public.audit_events(organization_id,actor_id,action,target_id) values(org,auth.uid(),'plan.'||plan,org);
end $$;

revoke all on function public.create_invitation(uuid,text,text,text),public.set_account_status(text,uuid,text),public.set_organization_plan(uuid,text) from public,anon;
grant execute on function public.create_invitation(uuid,text,text,text),public.set_account_status(text,uuid,text),public.set_organization_plan(uuid,text) to authenticated;
revoke all on function private.register_identity() from public,anon;
create index invitations_org on public.invitations(organization_id,status);
commit;
