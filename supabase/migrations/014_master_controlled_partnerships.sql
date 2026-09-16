begin;
-- Commercial organizations cannot create fulfillment partnerships.
-- Owner activation remains bound to the private verified-email allowlist (012).
create or replace function public.create_invitation(org uuid, recipient_email text, recipient_name text, requested_role text) returns jsonb
language plpgsql security definer set search_path='' as $$
declare invitation uuid; secret text:=gen_random_uuid()::text||gen_random_uuid()::text; begin
 if not (private.is_admin() or coalesce(private.member_role(org)='distributor_admin',false)) then raise exception 'No autorizado' using errcode='42501'; end if;
 if not exists(select 1 from public.organizations where id=org and kind='distribuidor' and status='active') then raise exception 'Distribuidor no disponible'; end if;
 if requested_role='fulfillment_partner' and not private.is_admin() then raise exception 'Solo el administrador maestro de Surtiva crea alianzas' using errcode='42501'; end if;
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
 if requested='fulfillment_partner' and nullif(new.raw_user_meta_data->>'invitation_token','') is null then raise exception 'Las alianzas requieren invitación del administrador maestro' using errcode='42501'; end if;
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

commit;
