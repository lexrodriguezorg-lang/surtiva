begin;
create or replace function public.create_order(org uuid, customer_key uuid, items jsonb, request_key uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.clients; p public.products; item jsonb; qty integer; price numeric; amount numeric:=0; order_key uuid:=gen_random_uuid(); lines jsonb:='[]'; member_role text; rate numeric; existing uuid;
begin
 member_role:=private.member_role(org);
 if private.is_merchant(org,customer_key) then member_role:='merchant'; end if;
 if not private.is_admin() and (member_role is null or member_role not in ('distributor_admin','seller','merchant')) then raise exception 'No autorizado' using errcode='42501'; end if;
 if request_key is not null then
  perform pg_advisory_xact_lock(hashtextextended(org::text||auth.uid()::text||request_key::text,0));
  select id into existing from public.orders o where o.organization_id=org and o.created_by=auth.uid() and o.request_key=create_order.request_key;
  if found then return existing; end if;
 end if;
 select * into c from public.clients where organization_id=org and id=customer_key and status='active';
 if not found or not private.scope(org,c.seller_id,c.id) then raise exception 'Cliente no autorizado' using errcode='42501'; end if;
 if items is null or jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 100 then raise exception 'Pedido inválido'; end if;
 if (select count(distinct x->>'productId') from jsonb_array_elements(items) x)<>jsonb_array_length(items) then raise exception 'Referencias duplicadas'; end if;
 for item in select * from jsonb_array_elements(items) loop
  if (item->>'quantity') !~ '^[0-9]{1,5}$' then raise exception 'Cantidad inválida'; end if;
  qty:=(item->>'quantity')::integer;
  if qty is null or qty<1 or qty>99999 then raise exception 'Cantidad inválida'; end if;
  select * into p from public.products where organization_id=org and id=(item->>'productId')::uuid and active for share;
  if not found or not private.can_product(org,p.id) then raise exception 'Producto no autorizado' using errcode='42501'; end if;
  price:=round(p.price*case when qty>=48 then 1 when qty>=24 then 1.03 when qty>=12 then 1.08 when qty>=6 then 1.13 when qty>=3 then 1.18 else 1.27 end);
  amount:=amount+qty*price;
  lines:=lines||jsonb_build_array(jsonb_build_object('product',p.id,'title',p.title,'qty',qty,'price',price));
 end loop;
 insert into public.orders(id,organization_id,number,customer_id,seller_id,total,status,created_by,request_key)
 values(order_key,org,'SU-'||upper(substr(order_key::text,1,8)),c.id,c.seller_id,amount,case when member_role='seller' then 'aprobacion' else 'recibido' end,auth.uid(),request_key);
 insert into public.order_items(organization_id,order_id,product_id,title,quantity,unit_price)
 select org,order_key,(x->>'product')::uuid,x->>'title',(x->>'qty')::int,(x->>'price')::numeric from jsonb_array_elements(lines) x;
 select commission_rate into rate from public.organizations where id=org;
 if c.seller_id is not null then
  insert into public.commissions(organization_id,order_id,seller_id,amount) values(org,order_key,c.seller_id,round(amount*rate,2));
 end if;
 insert into public.order_events(organization_id,order_id,actor_id,description) values(org,order_key,auth.uid(),'Pedido registrado');
 return order_key;
end $$;
revoke all on function public.create_order(uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.create_order(uuid,uuid,jsonb,uuid) to authenticated;

create or replace function public.transition_order(org uuid, order_key uuid, next_status text) returns text language plpgsql security definer set search_path='' as $$
declare o public.orders; r text; line record; inv public.inventory;
begin
 select * into o from public.orders where organization_id=org and id=order_key for update;
 if not found or not private.scope(org,o.seller_id,o.customer_id,o.fulfillment_point_id) then raise exception 'Pedido no autorizado' using errcode='42501'; end if;
 r:=case when private.is_admin() then 'distributor_admin'
 when private.is_merchant(org,o.customer_id) then 'merchant'
 when private.is_partner(org,o.fulfillment_point_id) then 'fulfillment_partner'
 else private.member_role(org) end;
 if not coalesce((o.status='aprobacion' and ((r='merchant' and next_status in ('recibido','rechazado')) or (r in ('seller','distributor_admin') and next_status='cancelado')))
 or (o.status='recibido' and r='distributor_admin' and next_status in ('preparando','cancelado'))
 or (o.status='preparando' and ((r in ('distributor_admin','fulfillment_partner') and next_status='despachado') or (r='distributor_admin' and next_status='cancelado')))
 or (o.status='despachado' and r in ('merchant','distributor_admin') and next_status='entregado'),false) then raise exception 'Transición no permitida' using errcode='42501'; end if;
 -- Stable lock ordering prevents overselling and deadlocks across orders.
 if next_status in ('preparando','despachado') or (next_status='cancelado' and o.status='preparando') then
  for line in select * from public.order_items where organization_id=org and order_id=o.id order by product_id loop
   select * into inv from public.inventory where organization_id=org and product_id=line.product_id for update;
   if not found or inv.quantity is null then raise exception 'Confirma existencias antes de preparar'; end if;
   if next_status='preparando' then
    if inv.quantity-inv.reserved<line.quantity then raise exception 'Existencias insuficientes'; end if;
    update public.inventory set reserved=reserved+line.quantity where organization_id=org and product_id=line.product_id;
   elsif next_status='despachado' then
    update public.inventory set quantity=quantity-line.quantity,reserved=reserved-line.quantity where organization_id=org and product_id=line.product_id;
   else
    update public.inventory set reserved=reserved-line.quantity where organization_id=org and product_id=line.product_id;
   end if;
  end loop;
 end if;
 if next_status='entregado' then
  insert into public.retail_inventory(organization_id,distributor_organization_id,customer_id,product_id,quantity,price)
  select (select merchant_organization_id from public.clients where id=o.customer_id),org,o.customer_id,product_id,quantity,unit_price from public.order_items where organization_id=org and order_id=o.id
  on conflict(organization_id,customer_id,product_id) do update set quantity=public.retail_inventory.quantity+excluded.quantity;
  insert into public.invoices(organization_id,order_id,customer_id,number,total,due_date) values(org,o.id,o.customer_id,'FC-'||o.number,o.total,current_date+30);
 end if;
 update public.orders set status=next_status where id=o.id;
 insert into public.order_events(organization_id,order_id,actor_id,description) values(org,o.id,auth.uid(),next_status);
 return next_status;
end $$;
revoke all on function public.transition_order(uuid,uuid,text) from public,anon;
grant execute on function public.transition_order(uuid,uuid,text) to authenticated;
create or replace function public.create_entity(org uuid, kind text, payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare entity uuid:=gen_random_uuid(); entity_name text:=trim(payload->>'name');
begin
 if not private.scope(org) then raise exception 'No autorizado' using errcode='42501'; end if;
 if entity_name is null or length(entity_name) not between 1 and 150 then raise exception 'Nombre inválido'; end if;
 case kind
 when 'seller' then insert into public.sellers(id,organization_id,name,territory) values(entity,org,entity_name,left(payload->>'territory',120));
 when 'customer' then raise exception 'Invita al comercio para vincular su organización tras aprobación';
 when 'point' then raise exception 'Invita al aliado para vincular su organización tras aprobación';
 when 'supplier' then insert into public.suppliers(id,organization_id,name,contact) values(entity,org,entity_name,left(payload->>'contact',200));
 when 'product' then
  if length(coalesce(payload->>'sku','')) not between 1 and 50 or (payload->>'price')::numeric is null or (payload->>'price')::numeric<=0 then raise exception 'SKU o precio inválido'; end if;
  insert into public.products(id,organization_id,sku,title,category,price) values(entity,org,payload->>'sku',entity_name,coalesce(nullif(payload->>'category',''),'Varios'),(payload->>'price')::numeric);
  insert into public.inventory(organization_id,product_id) values(org,entity);
 else raise exception 'Entidad inválida';
 end case;
 insert into public.audit_events(organization_id,actor_id,action,target_id) values(org,auth.uid(),'create.'||kind,entity);
 return entity;
end $$;
revoke all on function public.create_entity(uuid,text,jsonb) from public,anon;
grant execute on function public.create_entity(uuid,text,jsonb) to authenticated;

create or replace function public.set_catalog_access(org uuid, product_key uuid, entity_kind text, entity_key uuid, enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.scope(org) then raise exception 'No autorizado' using errcode='42501'; end if;
 if entity_kind not in ('seller','merchant') then raise exception 'Perfil inválido'; end if;
 if enabled then
  insert into public.catalog_access(organization_id,product_id,seller_id,customer_id) values(org,product_key,case when entity_kind='seller' then entity_key end,case when entity_kind='merchant' then entity_key end) on conflict do nothing;
 else
  delete from public.catalog_access where organization_id=org and product_id=product_key and ((entity_kind='seller' and seller_id=entity_key) or (entity_kind='merchant' and customer_id=entity_key));
 end if;
 insert into public.audit_events(organization_id,actor_id,action,target_id) values(org,auth.uid(),case when enabled then 'catalog.grant' else 'catalog.revoke' end,product_key);
end $$;
revoke all on function public.set_catalog_access(uuid,uuid,text,uuid,boolean) from public,anon;
grant execute on function public.set_catalog_access(uuid,uuid,text,uuid,boolean) to authenticated;

create or replace function public.assign_fulfillment(org uuid, order_key uuid, point_key uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders;
begin
 if not private.scope(org) then raise exception 'No autorizado' using errcode='42501'; end if;
 select * into o from public.orders where organization_id=org and id=order_key for update;
 if not found or o.status not in ('aprobacion','recibido','preparando') then raise exception 'Pedido no asignable'; end if;
 if not exists(select 1 from public.fulfillment_nodes n join public.organization_relationships r on r.partner_organization_id=n.organization_id
 join public.organizations p on p.id=n.organization_id where r.organization_id=org and n.id=point_key and r.kind='fulfillment_partner' and r.status='active' and p.status='active') then raise exception 'Punto no autorizado'; end if;
 update public.orders set fulfillment_point_id=point_key where id=o.id;
 delete from public.fulfillment_records where organization_id=org and order_id=o.id;
 insert into public.fulfillment_records(organization_id,order_id,fulfillment_point_id,committed_stock)
 values(org,o.id,point_key,coalesce((select jsonb_agg(jsonb_build_object('productId',l.product_id,'title',l.title,'quantity',l.quantity)) from public.order_items l where l.organization_id=org and l.order_id=o.id and o.status='preparando'),'[]'));
 insert into public.order_events(organization_id,order_id,actor_id,description) values(org,o.id,auth.uid(),'Punto de cumplimiento asignado');
end $$;
revoke all on function public.assign_fulfillment(uuid,uuid,uuid) from public,anon;
grant execute on function public.assign_fulfillment(uuid,uuid,uuid) to authenticated;

create or replace function public.record_local_sale(org uuid, customer_key uuid, items jsonb, sale_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare sale uuid:=gen_random_uuid(); existing uuid; item jsonb; inv public.retail_inventory; qty integer; amount numeric:=0; snapshot jsonb:='[]'; product_title text;
begin
 if not (private.is_admin() or coalesce(private.member_role(org)='merchant',false)) or not exists(select 1 from public.clients where id=customer_key and merchant_organization_id=org) then raise exception 'Comercio no autorizado' using errcode='42501'; end if;
 if sale_key is null then raise exception 'Falta identificador de venta'; end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||customer_key::text||sale_key::text,0));
 select id into existing from public.local_sales where organization_id=org and customer_id=customer_key and request_key=sale_key;
 if found then return existing; end if;
 if items is null or jsonb_typeof(items)<>'array' or jsonb_array_length(items) not between 1 and 100 then raise exception 'Venta inválida'; end if;
 if (select count(distinct x->>'productId') from jsonb_array_elements(items) x)<>jsonb_array_length(items) then raise exception 'Referencias duplicadas'; end if;
 for item in select * from jsonb_array_elements(items) order by value->>'productId' loop
  if (item->>'quantity') !~ '^[0-9]{1,5}$' then raise exception 'Cantidad inválida'; end if;
  qty:=(item->>'quantity')::integer;if qty is null or qty<1 then raise exception 'Cantidad inválida'; end if;
  select * into inv from public.retail_inventory where organization_id=org and customer_id=customer_key and product_id=(item->>'productId')::uuid for update;
  if not found or inv.quantity<qty then raise exception 'Inventario insuficiente'; end if;
  select title into product_title from public.products where organization_id=inv.distributor_organization_id and id=inv.product_id;
  update public.retail_inventory set quantity=quantity-qty where organization_id=org and customer_id=customer_key and product_id=inv.product_id;
  amount:=amount+qty*inv.price;snapshot:=snapshot||jsonb_build_array(jsonb_build_object('productId',inv.product_id,'title',product_title,'quantity',qty,'unitPrice',inv.price));
 end loop;
 insert into public.local_sales(id,organization_id,distributor_organization_id,customer_id,total,lines,request_key) values(sale,org,inv.distributor_organization_id,customer_key,amount,snapshot,sale_key);
 return sale;
end $$;
revoke all on function public.record_local_sale(uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.record_local_sale(uuid,uuid,jsonb,uuid) to authenticated;

commit;
