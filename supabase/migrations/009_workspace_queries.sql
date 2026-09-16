begin;
-- This function deliberately runs as the caller: RLS is never bypassed.
create function public.workspace_data(org uuid, resource text, page_offset integer default 0, order_filter uuid default null)
returns jsonb language plpgsql stable security invoker set search_path='' as $$
declare kind text; predicate text:='t.organization_id=$1'; ordering text:='t.id'; statement text; result jsonb; begin
 if not private.is_admin() and private.member_role(org) is null then raise exception 'No tienes acceso a esta organización' using errcode='42501'; end if;
 select o.kind into kind from public.organizations o where o.id=org;
 if resource is null or resource not in ('products','distributor_products','inventory','clients','sellers','suppliers','orders','order_items','order_events','commissions','followups','invoices','retail_inventory','local_sales','fulfillment_nodes','fulfillment_records','memberships','catalog_access','organization_relationships','invitations') then raise exception 'Recurso inválido' using errcode='42501'; end if;
 if page_offset is null or page_offset<0 or page_offset>100000 then raise exception 'Página inválida'; end if;
 if resource in ('products','distributor_products','catalog_access') and kind='comercio' then
  predicate:='exists(select 1 from public.clients c where c.organization_id=t.organization_id and c.merchant_organization_id=$1 and c.status=''active'')';
 elsif resource='clients' and kind='comercio' then predicate:='t.merchant_organization_id=$1';
 elsif resource='orders' and kind='comercio' then predicate:='exists(select 1 from public.clients c where c.id=t.customer_id and c.merchant_organization_id=$1)';
 elsif resource='orders' and kind='cumplimiento' then predicate:='exists(select 1 from public.fulfillment_nodes n where n.id=t.fulfillment_point_id and n.organization_id=$1)';
 elsif resource in ('order_items','order_events','fulfillment_records','invoices') and kind in ('comercio','cumplimiento') then
  predicate:=case when kind='comercio' then 'exists(select 1 from public.orders o join public.clients c on c.id=o.customer_id where o.id=t.order_id and c.merchant_organization_id=$1)'
   else 'exists(select 1 from public.orders o join public.fulfillment_nodes n on n.id=o.fulfillment_point_id where o.id=t.order_id and n.organization_id=$1)' end;
 elsif resource='fulfillment_nodes' and kind='distribuidor' then predicate:='exists(select 1 from public.organization_relationships r where r.organization_id=$1 and r.partner_organization_id=t.organization_id and r.kind=''fulfillment_partner'' and r.status=''active'')';
 elsif resource='organization_relationships' then predicate:='(t.organization_id=$1 or t.partner_organization_id=$1)';
 end if;
 if resource in ('products') then ordering:='t.sku'; end if;
 if resource in ('inventory','distributor_products') then ordering:='t.product_id'; end if;
 if resource='retail_inventory' then ordering:='t.customer_id,t.product_id'; end if;
 if resource in ('orders','order_events','local_sales','followups','invitations') then ordering:='t.created_at desc,t.id'; end if;
 if order_filter is not null then
  if resource not in ('order_items','order_events','fulfillment_records') then raise exception 'Filtro no disponible'; end if;
  predicate:=predicate||' and t.order_id=$3';
 end if;
 if resource='invitations' then
  statement:='select coalesce(jsonb_agg(to_jsonb(q)),''[]''::jsonb) from (select t.id,t.organization_id,t.email,t.name,t.role_id,t.status,t.created_at,t.expires_at,t.accepted_by from public.invitations t where '||predicate||' order by '||ordering||' limit 100 offset $2) q';
 else statement:=format('select coalesce(jsonb_agg(to_jsonb(q)),''[]''::jsonb) from (select t.* from public.%I t where %s order by %s limit 100 offset $2) q',resource,predicate,ordering); end if;
 execute statement into result using org,page_offset,order_filter;
 return result;
end $$;
revoke all on function public.workspace_data(uuid,text,integer,uuid) from public,anon;
grant execute on function public.workspace_data(uuid,text,integer,uuid) to authenticated;

-- Existing verified users can attach an invitation without registering again.
create function public.accept_invitation(invitation_token text) returns uuid language plpgsql security definer set search_path='' as $$
declare i public.invitations; u auth.users; request uuid; begin
 select * into u from auth.users where id=auth.uid();
 if u.id is null or u.email_confirmed_at is null then raise exception 'Verifica tu cuenta antes de aceptar' using errcode='42501'; end if;
 select * into i from public.invitations where token_hash=encode(sha256(convert_to(invitation_token,'UTF8')),'hex') and status='pending' and expires_at>now() for update;
 if not found or i.email<>lower(u.email) or (i.accepted_by is not null and i.accepted_by<>u.id) then raise exception 'Invitación inválida o vencida'; end if;
 if exists(select 1 from public.access_requests where user_id=u.id and status='pending' and invitation_id is distinct from i.id) then raise exception 'Ya tienes una solicitud pendiente'; end if;
 insert into public.access_requests(user_id,organization_name,requested_role,invitation_id)
 values(u.id,i.name,i.role_id,i.id) on conflict(user_id) do update set organization_name=excluded.organization_name,requested_role=excluded.requested_role,invitation_id=excluded.invitation_id,status='pending',organization_id=null,reviewed_by=null,reviewed_at=null
 returning id into request;
 update public.invitations set accepted_by=u.id where id=i.id;
 return request;
end $$;
revoke all on function public.accept_invitation(text) from public,anon;
grant execute on function public.accept_invitation(text) to authenticated;

-- Merchants can read their own trading accounts, used to select a supplier.
insert into public.role_permissions values ('merchant','customers.read');
commit;
