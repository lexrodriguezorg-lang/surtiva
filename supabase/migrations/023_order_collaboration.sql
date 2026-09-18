begin;
alter table public.orders
 add column approval_status text not null default 'pending' check(approval_status in ('pending','approved','changes_requested')),
 add column availability_status text not null default 'not_requested' check(availability_status in ('not_requested','requested','confirmed','partial')),
 add column revision integer not null default 1 check(revision>0),
 add column authorized_by uuid references public.profiles(id),
 add column authorized_at timestamptz,
 add column availability_by uuid references public.profiles(id),
 add column availability_at timestamptz,
 add column assigned_to uuid references public.memberships(id),
 add column updated_at timestamptz not null default now();
alter table public.order_events add column details jsonb not null default '{}';
-- Preserve operations already in progress. Pending orders enter the new review process.
update public.orders set approval_status='approved',availability_status='confirmed' where status in ('preparando','despachado','entregado');

create function private.order_actions(o public.orders) returns text[] language plpgsql stable security definer set search_path='' as $$
declare actions text[]:=array['note']; master boolean:=private.is_admin(); manager boolean:=private.is_admin() or coalesce(private.member_role(o.organization_id)='distributor_admin',false); mutable boolean:=o.status in ('aprobacion','recibido'); partner boolean:=private.is_partner(o.organization_id,o.fulfillment_point_id);
begin
 if not private.can_order(o.organization_id,o.id) then return '{}'; end if;
 if mutable and not partner then actions:=actions||array['edit','cancel']; end if;
 if mutable and master then actions:=actions||array['authorize','request_availability','request_changes']; end if;
 if mutable and manager then actions:=actions||array['confirm_availability']; end if;
 if manager and o.status in ('aprobacion','recibido','preparando') then actions:=actions||array['assign']; end if;
 if manager and mutable and o.approval_status='approved' and o.availability_status='confirmed' then actions:=actions||array['prepare']; end if;
 if o.status='preparando' and (manager or partner) then actions:=actions||array['ship']; end if;
 if o.status='preparando' and manager then actions:=actions||array['cancel']; end if;
 if o.status='despachado' and (manager or private.is_merchant(o.organization_id,o.customer_id)) then actions:=actions||array['deliver']; end if;
 return actions;
end $$;
revoke all on function private.order_actions(public.orders) from public,anon,authenticated;

create function public.order_workspace(order_key uuid) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare o public.orders; manager boolean; result jsonb;
begin
 select * into o from public.orders where id=order_key;
 if not found or not private.can_order(o.organization_id,o.id) then raise exception 'Pedido no autorizado' using errcode='42501'; end if;
 manager:=private.is_admin() or coalesce(private.member_role(o.organization_id)='distributor_admin',false);
 select jsonb_build_object('order',to_jsonb(o),'actions',private.order_actions(o),
 'customer',(select name from public.clients where id=o.customer_id),'distributor',(select name from public.organizations where id=o.organization_id),
 'seller',(select name from public.sellers where id=o.seller_id),
 'responsible',(select p.name from public.memberships m join public.profiles p on p.id=m.user_id where m.id=o.assigned_to),
 'assignees',case when manager then coalesce((select jsonb_agg(jsonb_build_object('id',m.id,'name',p.name,'role',m.role_id)) from public.memberships m join public.profiles p on p.id=m.user_id join public.organizations org on org.id=m.organization_id where m.status='active' and org.status='active' and ((m.organization_id=o.organization_id and m.role_id in ('distributor_admin','seller') and (m.role_id='distributor_admin' or m.seller_id=o.seller_id)) or (private.is_admin() and org.kind='plataforma' and m.role_id='surtiva_admin'))),'[]') else '[]'::jsonb end,
 'items',coalesce((select jsonb_agg(jsonb_build_object('productId',l.product_id,'title',l.title,'quantity',l.quantity,'unitPrice',l.unit_price,'image',p.image,'sku',p.sku,'stock',case when manager then i.quantity else null end,'reserved',case when manager then i.reserved else null end) order by l.id) from public.order_items l join public.products p on p.id=l.product_id left join public.inventory i on i.organization_id=o.organization_id and i.product_id=l.product_id where l.order_id=o.id),'[]'),
 'events',coalesce((select jsonb_agg(jsonb_build_object('description',e.description,'at',e.created_at,'actor',coalesce(p.name,'Comercio'),'details',e.details) order by e.created_at desc,e.id) from public.order_events e left join public.profiles p on p.id=e.actor_id where e.order_id=o.id),'[]')) into result;
 return result;
end $$;
revoke all on function public.order_workspace(uuid) from public,anon;
grant execute on function public.order_workspace(uuid) to authenticated;

-- Called only after an authenticated scope check or a validated commercial capability.
create function private.revise_order(order_key uuid,expected_revision integer,items jsonb,note text,capability uuid default null) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders; p public.products; a public.commercial_accesses; item jsonb; qty integer; v_amount numeric:=0; price numeric; lines jsonb:='[]'; previous jsonb; rate numeric;
begin
 select * into o from public.orders where id=order_key for update;
 if not found then raise exception 'Pedido no autorizado' using errcode='42501'; end if;
 if capability is null then
  if not ('edit'=any(private.order_actions(o))) then raise exception 'No puedes editar este pedido' using errcode='42501'; end if;
 else
  select * into a from public.commercial_accesses where id=capability and status='active' and expires_at>now();
  if not found or a.organization_id<>o.organization_id or a.client_id<>o.customer_id then raise exception 'Pedido no autorizado' using errcode='42501'; end if;
 end if;
 if o.status not in ('aprobacion','recibido') then raise exception 'La preparación ya comenzó. Coordina un cambio con el responsable.'; end if;
 if expected_revision is distinct from o.revision then raise exception 'El pedido cambió. Ábrelo de nuevo antes de guardar.' using errcode='40001'; end if;
 if length(coalesce(trim(note),'')) not between 3 and 1000 then raise exception 'Describe el motivo del cambio'; end if;
 if items is null or jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 100 then raise exception 'Incluye de 1 a 100 referencias'; end if;
 if (select count(distinct x->>'productId') from jsonb_array_elements(items) x)<>jsonb_array_length(items) then raise exception 'Referencias duplicadas'; end if;
 for item in select * from jsonb_array_elements(items) order by value->>'productId' loop
  if coalesce(item->>'quantity','') !~ '^[0-9]{1,5}$' then raise exception 'Cantidad inválida'; end if;
  qty:=(item->>'quantity')::integer;if qty<1 then raise exception 'Cantidad inválida'; end if;
  select * into p from public.products where organization_id=o.organization_id and id=(item->>'productId')::uuid and active for share;
  if not found then raise exception 'Producto no disponible'; end if;
  if capability is not null then
   if not exists(select 1 from private.portal_products(a) where id=p.id) then raise exception 'Producto no autorizado' using errcode='42501'; end if;
  elsif not private.can_product(o.organization_id,p.id) then raise exception 'Producto no autorizado' using errcode='42501'; end if;
  price:=round(p.price*case when qty>=48 then 1 when qty>=24 then 1.03 when qty>=12 then 1.08 when qty>=6 then 1.13 when qty>=3 then 1.18 else 1.27 end);
  v_amount:=v_amount+qty*price;lines:=lines||jsonb_build_array(jsonb_build_object('productId',p.id,'title',p.title,'quantity',qty,'unitPrice',price));
 end loop;
 select jsonb_agg(jsonb_build_object('productId',product_id,'title',title,'quantity',quantity,'unitPrice',unit_price)) into previous from public.order_items where order_id=o.id;
 delete from public.order_items where order_id=o.id;
 insert into public.order_items(organization_id,order_id,product_id,title,quantity,unit_price) select o.organization_id,o.id,(x->>'productId')::uuid,x->>'title',(x->>'quantity')::integer,(x->>'unitPrice')::numeric from jsonb_array_elements(lines) x;
 select commission_rate into rate from public.organizations where id=o.organization_id;
 update public.commissions set amount=round(v_amount*rate,2) where order_id=o.id;
 update public.orders set total=v_amount,discount=0,approval_status='pending',availability_status='not_requested',authorized_by=null,authorized_at=null,availability_by=null,availability_at=null,revision=revision+1,updated_at=now() where id=o.id;
 insert into public.order_events(organization_id,order_id,actor_id,description,details) values(o.organization_id,o.id,auth.uid(),'Pedido editado · requiere nueva revisión',jsonb_build_object('note',trim(note),'before',previous,'after',lines,'previousTotal',o.total,'total',v_amount,'revision',o.revision+1));
end $$;
revoke all on function private.revise_order(uuid,integer,jsonb,text,uuid) from public,anon,authenticated;

-- Preserve the existing stock reservation / delivery implementation behind a guard.
alter function public.transition_order(uuid,uuid,text) rename to transition_order_stock;
alter function public.transition_order_stock(uuid,uuid,text) set schema private;
revoke all on function private.transition_order_stock(uuid,uuid,text) from public,anon,authenticated;
create function public.transition_order(org uuid,order_key uuid,next_status text) returns text language plpgsql security definer set search_path='' as $$
declare o public.orders;begin
 select * into o from public.orders where id=order_key and organization_id=org for update;
 if not found or not private.can_order(org,order_key) then raise exception 'Pedido no autorizado' using errcode='42501'; end if;
 if next_status='preparando' and (o.approval_status<>'approved' or o.availability_status<>'confirmed') then raise exception 'Faltan autorización de Surtiva o confirmación del distribuidor'; end if;
 return private.transition_order_stock(org,order_key,next_status);
end $$;
revoke all on function public.transition_order(uuid,uuid,text) from public,anon;
grant execute on function public.transition_order(uuid,uuid,text) to authenticated;

create function public.act_on_order(order_key uuid,expected_revision integer,operation text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare o public.orders; line record; stock integer; qty_text text; sufficient boolean:=true; assignee uuid; description text; details jsonb:='{}'; note text:=left(trim(coalesce(payload->>'note','')),1000); next_status text;
begin
 select * into o from public.orders where id=order_key for update;
 if not found or not (operation=any(private.order_actions(o))) then raise exception 'Acción no autorizada para este pedido' using errcode='42501'; end if;
 if expected_revision is distinct from o.revision then raise exception 'El pedido cambió. Ábrelo de nuevo antes de guardar.' using errcode='40001'; end if;
 if payload is null or jsonb_typeof(payload)<>'object' or length(payload::text)>30000 then raise exception 'Solicitud inválida'; end if;
 if operation='edit' then perform private.revise_order(o.id,expected_revision,payload->'items',note);return public.order_workspace(o.id); end if;
 case operation
 when 'authorize' then
  update public.orders set approval_status='approved',authorized_by=auth.uid(),authorized_at=now(),status='recibido',availability_status=case when availability_status='not_requested' then 'requested' else availability_status end where id=o.id;
  description:='Surtiva autorizó el pedido y lo envió al distribuidor';
 when 'request_availability' then
  update public.orders set availability_status='requested',availability_by=null,availability_at=null where id=o.id;description:='Surtiva solicitó confirmación de disponibilidad al distribuidor';
 when 'request_changes' then
  if length(note)<3 then raise exception 'Indica qué debe cambiar'; end if;
  update public.orders set approval_status='changes_requested',authorized_by=null,authorized_at=null where id=o.id;description:='Surtiva solicitó ajustes al pedido';
 when 'confirm_availability' then
  if jsonb_typeof(payload->'items') is distinct from 'array' then raise exception 'Confirma las existencias de cada referencia'; end if;
  if jsonb_array_length(payload->'items')<>(select count(*) from public.order_items where order_id=o.id) or (select count(distinct x->>'productId') from jsonb_array_elements(payload->'items') x)<>jsonb_array_length(payload->'items') then raise exception 'Confirma cada referencia una sola vez'; end if;
  for line in select * from public.order_items where order_id=o.id order by product_id loop
   select x->>'stock' into qty_text from jsonb_array_elements(payload->'items') x where x->>'productId'=line.product_id::text;
   if coalesce(qty_text,'') !~ '^[0-9]{1,8}$' then raise exception 'Ingresa las existencias físicas de cada referencia'; end if;
   stock:=qty_text::integer;
   insert into public.inventory(organization_id,product_id,quantity,reserved,origin) values(o.organization_id,line.product_id,null,0,'confirmacion_distribuidor') on conflict do nothing;
   perform 1 from public.inventory where organization_id=o.organization_id and product_id=line.product_id for update;
   if stock<(select reserved from public.inventory where organization_id=o.organization_id and product_id=line.product_id) then raise exception 'Las existencias no pueden ser menores al stock comprometido'; end if;
   update public.inventory set quantity=stock,origin='confirmacion_distribuidor' where organization_id=o.organization_id and product_id=line.product_id;
   if stock-(select reserved from public.inventory where organization_id=o.organization_id and product_id=line.product_id)<line.quantity then sufficient:=false;end if;

  end loop;
  update public.orders set availability_status=case when sufficient then 'confirmed' else 'partial' end,availability_by=auth.uid(),availability_at=now() where id=o.id;
  description:=case when sufficient then 'Distribuidor confirmó disponibilidad completa' else 'Distribuidor reportó faltantes · ajustar cantidades o esperar reposición' end;
 when 'assign' then
  assignee:=nullif(payload->>'membershipId','')::uuid;
  if assignee is not null and not exists(select 1 from public.memberships m join public.organizations org on org.id=m.organization_id where m.id=assignee and m.status='active' and org.status='active' and ((m.organization_id=o.organization_id and (m.role_id='distributor_admin' or (m.role_id='seller' and m.seller_id=o.seller_id))) or (private.is_admin() and org.kind='plataforma' and m.role_id='surtiva_admin'))) then raise exception 'Responsable no autorizado'; end if;
  update public.orders set assigned_to=assignee where id=o.id;
  description:='Responsable actualizado';details:=jsonb_build_object('name',(select p.name from public.memberships m join public.profiles p on p.id=m.user_id where m.id=assignee));
 when 'note' then
  if length(note)<3 then raise exception 'Escribe el seguimiento';end if;description:='Seguimiento registrado';
 else
  next_status:=case operation when 'prepare' then 'preparando' when 'ship' then 'despachado' when 'deliver' then 'entregado' when 'cancel' then 'cancelado' end;
  -- Merchants and sellers may cancel their own order before warehouse preparation.
  if operation='cancel' and o.status in ('aprobacion','recibido') then update public.orders set status='cancelado' where id=o.id;
  else perform public.transition_order(o.organization_id,o.id,next_status);end if;
  description:=case operation when 'prepare' then 'Preparación iniciada · stock reservado' when 'ship' then 'Pedido despachado' when 'deliver' then 'Entrega confirmada' when 'cancel' then 'Pedido cancelado' end;
 end case;
 update public.orders set revision=revision+1,updated_at=now() where id=o.id;
 insert into public.order_events(organization_id,order_id,actor_id,description,details) values(o.organization_id,o.id,auth.uid(),description,details||jsonb_build_object('note',note,'revision',o.revision+1));
 return public.order_workspace(o.id);
end $$;
revoke all on function public.act_on_order(uuid,integer,text,jsonb) from public,anon;
grant execute on function public.act_on_order(uuid,integer,text,jsonb) to authenticated;
-- The commercial link can edit only its own customer's pending orders.
alter function public.commercial_portal(text,text,jsonb) rename to commercial_portal_base;
alter function public.commercial_portal_base(text,text,jsonb) set schema private;
revoke all on function private.commercial_portal_base(text,text,jsonb) from public,anon,authenticated;
create function public.commercial_portal(secret text,operation text default 'catalog',payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.commercial_accesses; result jsonb; order_key uuid;
begin
 if operation not in ('orders','edit_order') then return private.commercial_portal_base(secret,operation,payload);end if;
 a:=private.commercial_access(secret);
 if operation='edit_order' then
  if payload is null or jsonb_typeof(payload)<>'object' or length(payload::text)>24000 then raise exception 'Solicitud inválida';end if;
  order_key:=(payload->>'id')::uuid;
  perform private.revise_order(order_key,(payload->>'revision')::integer,payload->'items',payload->>'note',a.id);
  return jsonb_build_object('ok',true);
 end if;
 select jsonb_build_object('orders',coalesce(jsonb_agg(to_jsonb(t)),'[]')) into result from (
 select o.id,o.number,o.status,o.total,o.created_at,o.approval_status,o.availability_status,o.revision,o.status in ('aprobacion','recibido') editable,
 (select p.name from public.memberships m join public.profiles p on p.id=m.user_id where m.id=o.assigned_to) responsible,
 (select org.name from public.organizations org where org.id=o.organization_id) distributor,
 (select jsonb_agg(jsonb_build_object('productId',l.product_id,'title',l.title,'quantity',l.quantity,'unitPrice',l.unit_price)) from public.order_items l where l.order_id=o.id) items,
 (select jsonb_agg(jsonb_build_object('description',e.description,'at',e.created_at,'note',e.details->>'note') order by e.created_at desc) from public.order_events e where e.order_id=o.id) events
 from public.orders o where o.customer_id=a.client_id and o.organization_id=a.organization_id order by o.created_at desc limit 30) t;
 return result;
end $$;
revoke all on function public.commercial_portal(text,text,jsonb) from public;
grant execute on function public.commercial_portal(text,text,jsonb) to anon,authenticated;
commit;
