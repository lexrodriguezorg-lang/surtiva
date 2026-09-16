begin;
-- Identity registration creates only a pending request. Never trust a metadata role as authorization.
create function private.register_identity() returns trigger language plpgsql security definer set search_path='' as $$
declare requested text := new.raw_user_meta_data->>'requested_role';
begin
 if requested is null or requested not in ('distribuidor','vendedor','comercio','aliado') then raise exception 'Perfil solicitado inválido'; end if;
 insert into public.profiles(id,name) values(new.id,left(trim(new.raw_user_meta_data->>'name'),100));
 insert into public.access_requests(user_id,organization_name,requested_role)
 values(new.id,left(trim(new.raw_user_meta_data->>'organization_name'),120),requested);
 return new;
end $$;
revoke all on function private.register_identity() from public;
create trigger surtiva_identity after insert on auth.users for each row execute function private.register_identity();

create function public.review_access(request_id uuid, decision text, target_org uuid default null, assigned_role text default null, entity_id uuid default null, new_org_name text default null)
returns uuid language plpgsql security definer set search_path='' as $$
declare r public.access_requests; org uuid := target_org; selected_role text; org_kind text; entity uuid := entity_id;
begin
 if not private.is_admin() then raise exception 'No autorizado' using errcode='42501'; end if;
 select * into r from public.access_requests where id=request_id for update;
 if not found or r.status<>'pendiente' then raise exception 'La solicitud ya fue revisada o no existe'; end if;
 if decision not in ('aprobar','rechazar') then raise exception 'Decisión inválida'; end if;
 if decision='rechazar' then
  update public.access_requests set status='rechazada',reviewed_by=auth.uid(),reviewed_at=now() where id=r.id;
 else
  if not exists(select 1 from auth.users where id=r.user_id and email_confirmed_at is not null) then raise exception 'El correo todavía no está verificado'; end if;
  selected_role := coalesce(assigned_role,r.requested_role);
  if selected_role not in ('distribuidor','vendedor','comercio','aliado') then raise exception 'Rol inválido'; end if;
  if org is null then
   if selected_role<>'distribuidor' or length(trim(coalesce(new_org_name,''))) not between 1 and 120 then raise exception 'Selecciona una organización y entidad o crea un distribuidor'; end if;
   org := gen_random_uuid();
   insert into public.organizations(id,name,slug,kind) values(org,trim(new_org_name),'org-'||org::text,'distribuidor');
  end if;
  select kind into org_kind from public.organizations where id=org and active;
  if not found then raise exception 'Organización no disponible'; end if;
  -- Foreign keys validate that the chosen entity belongs to this exact organization.
  insert into public.memberships(organization_id,user_id,role_id,seller_id,customer_id,fulfillment_point_id)
  values(org,r.user_id,selected_role,case when selected_role='vendedor' then entity end,case when selected_role='comercio' then entity end,case when selected_role='aliado' then entity end);
  update public.access_requests set status='aprobada',organization_id=org,reviewed_by=auth.uid(),reviewed_at=now() where id=r.id;
 end if;
 insert into public.audit_events(organization_id,actor_id,action,target_id) values(org,auth.uid(),'access.'||decision,r.id);
 return org;
end $$;
revoke all on function public.review_access(uuid,text,uuid,text,uuid,text) from public,anon;
grant execute on function public.review_access(uuid,text,uuid,text,uuid,text) to authenticated;

create function public.set_membership_active(membership_id uuid, enabled boolean) returns void language plpgsql security definer set search_path='' as $$
declare org uuid;
begin
 if not private.is_admin() then raise exception 'No autorizado' using errcode='42501'; end if;
 update public.memberships set active=enabled where id=membership_id returning organization_id into org;
 if not found then raise exception 'Membresía no encontrada'; end if;
 insert into public.audit_events(organization_id,actor_id,action,target_id) values(org,auth.uid(),case when enabled then 'membership.activate' else 'membership.revoke' end,membership_id);
end $$;
revoke all on function public.set_membership_active(uuid,boolean) from public,anon;
grant execute on function public.set_membership_active(uuid,boolean) to authenticated;
commit;
