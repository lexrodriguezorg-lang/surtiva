begin;
alter table public.organizations add column commission_rate numeric(5,4) not null default 0 check(commission_rate between 0 and 1);
alter table public.orders add column request_key uuid;
create unique index order_idempotency on public.orders(organization_id,created_by,request_key) where request_key is not null;
create function public.create_order(org uuid, customer_key uuid, items jsonb, request_key uuid default null) returns uuid
language plpgsql security definer set search_path='' as $$
declare c public.customers; p public.products; item jsonb; qty integer; price numeric; amount numeric:=0; order_key uuid:=gen_random_uuid(); lines jsonb:='[]'; member_role text; rate numeric; existing uuid;
begin
 member_role:=private.member_role(org);
 if not private.is_admin() and (member_role is null or member_role not in ('distribuidor','vendedor','comercio')) then raise exception 'No autorizado' using errcode='42501'; end if;
 if request_key is not null then
  perform pg_advisory_xact_lock(hashtextextended(org::text||auth.uid()::text||request_key::text,0));
  select id into existing from public.orders o where o.organization_id=org and o.created_by=auth.uid() and o.request_key=create_order.request_key;
  if found then return existing; end if;
 end if;
 select * into c from public.customers where organization_id=org and id=customer_key;
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
 values(order_key,org,'SU-'||upper(substr(order_key::text,1,8)),c.id,c.seller_id,amount,case when member_role='vendedor' then 'aprobacion' else 'recibido' end,auth.uid(),request_key);
 insert into public.order_lines(organization_id,order_id,product_id,title,quantity,unit_price)
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

create function public.transition_order(org uuid, order_key uuid, next_status text) returns text language plpgsql security definer set search_path='' as $$
declare o public.orders; r text; line record; inv public.inventory;
begin
 select * into o from public.orders where organization_id=org and id=order_key for update;
 if not found or not private.scope(org,o.seller_id,o.customer_id,o.fulfillment_point_id) then raise exception 'Pedido no autorizado' using errcode='42501'; end if;
 r:=case when private.is_admin() then 'distribuidor' else private.member_role(org) end;
 if not coalesce((o.status='aprobacion' and ((r='comercio' and next_status in ('recibido','rechazado')) or (r in ('vendedor','distribuidor') and next_status='cancelado')))
 or (o.status='recibido' and r='distribuidor' and next_status in ('preparando','cancelado'))
 or (o.status='preparando' and ((r in ('distribuidor','aliado') and next_status='despachado') or (r='distribuidor' and next_status='cancelado')))
 or (o.status='despachado' and r in ('comercio','distribuidor') and next_status='entregado'),false) then raise exception 'Transición no permitida' using errcode='42501'; end if;
 -- Stable lock ordering prevents overselling and deadlocks across orders.
 if next_status in ('preparando','despachado') or (next_status='cancelado' and o.status='preparando') then
  for line in select * from public.order_lines where organization_id=org and order_id=o.id order by product_id loop
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
  insert into public.retail_inventory(organization_id,customer_id,product_id,quantity,price)
  select org,o.customer_id,product_id,quantity,unit_price from public.order_lines where organization_id=org and order_id=o.id
  on conflict(organization_id,customer_id,product_id) do update set quantity=public.retail_inventory.quantity+excluded.quantity;
  insert into public.receivables(organization_id,order_id,customer_id,number,total,due_date) values(org,o.id,o.customer_id,'FC-'||o.number,o.total,current_date+30);
 end if;
 update public.orders set status=next_status where id=o.id;
 insert into public.order_events(organization_id,order_id,actor_id,description) values(org,o.id,auth.uid(),next_status);
 return next_status;
end $$;
revoke all on function public.transition_order(uuid,uuid,text) from public,anon;
grant execute on function public.transition_order(uuid,uuid,text) to authenticated;
commit;
