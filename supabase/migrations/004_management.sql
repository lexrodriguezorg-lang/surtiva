begin;
create function public.create_entity(org uuid, kind text, payload jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare entity uuid:=gen_random_uuid(); entity_name text:=trim(payload->>'name');
begin
 if not private.scope(org) then raise exception 'No autorizado' using errcode='42501'; end if;
 if entity_name is null or length(entity_name) not between 1 and 150 then raise exception 'Nombre inválido'; end if;
 case kind
 when 'seller' then insert into public.sellers(id,organization_id,name,territory) values(entity,org,entity_name,left(payload->>'territory',120));
 when 'customer' then insert into public.customers(id,organization_id,name,city,seller_id) values(entity,org,entity_name,left(payload->>'city',120),nullif(payload->>'sellerId','')::uuid);
 when 'point' then insert into public.fulfillment_points(id,organization_id,name,city) values(entity,org,entity_name,left(payload->>'city',120));
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

create function public.set_catalog_access(org uuid, product_key uuid, entity_kind text, entity_key uuid, enabled boolean) returns void language plpgsql security definer set search_path='' as $$
begin
 if not private.scope(org) then raise exception 'No autorizado' using errcode='42501'; end if;
 if entity_kind not in ('vendedor','comercio') then raise exception 'Perfil inválido'; end if;
 if enabled then
  insert into public.catalog_access(organization_id,product_id,seller_id,customer_id) values(org,product_key,case when entity_kind='vendedor' then entity_key end,case when entity_kind='comercio' then entity_key end) on conflict do nothing;
 else
  delete from public.catalog_access where organization_id=org and product_id=product_key and ((entity_kind='vendedor' and seller_id=entity_key) or (entity_kind='comercio' and customer_id=entity_key));
 end if;
 insert into public.audit_events(organization_id,actor_id,action,target_id) values(org,auth.uid(),case when enabled then 'catalog.grant' else 'catalog.revoke' end,product_key);
end $$;
revoke all on function public.set_catalog_access(uuid,uuid,text,uuid,boolean) from public,anon;
grant execute on function public.set_catalog_access(uuid,uuid,text,uuid,boolean) to authenticated;

create function public.assign_fulfillment(org uuid, order_key uuid, point_key uuid) returns void language plpgsql security definer set search_path='' as $$
declare o public.orders;
begin
 if not private.scope(org) then raise exception 'No autorizado' using errcode='42501'; end if;
 select * into o from public.orders where organization_id=org and id=order_key for update;
 if not found or o.status not in ('aprobacion','recibido','preparando') then raise exception 'Pedido no asignable'; end if;
 if not exists(select 1 from public.fulfillment_points where organization_id=org and id=point_key) then raise exception 'Punto no autorizado'; end if;
 update public.orders set fulfillment_point_id=point_key where id=o.id;
 delete from public.fulfillment_records where organization_id=org and order_id=o.id;
 insert into public.fulfillment_records(organization_id,order_id,fulfillment_point_id,committed_stock)
 values(org,o.id,point_key,coalesce((select jsonb_agg(jsonb_build_object('productId',l.product_id,'title',l.title,'quantity',l.quantity)) from public.order_lines l where l.organization_id=org and l.order_id=o.id and o.status='preparando'),'[]'));
 insert into public.order_events(organization_id,order_id,actor_id,description) values(org,o.id,auth.uid(),'Punto de cumplimiento asignado');
end $$;
revoke all on function public.assign_fulfillment(uuid,uuid,uuid) from public,anon;
grant execute on function public.assign_fulfillment(uuid,uuid,uuid) to authenticated;

create function private.sync_fulfillment() returns trigger language plpgsql security definer set search_path='' as $$
begin
 update public.fulfillment_records set committed_stock=case when new.status='preparando' then coalesce((select jsonb_agg(jsonb_build_object('productId',l.product_id,'title',l.title,'quantity',l.quantity)) from public.order_lines l where l.organization_id=new.organization_id and l.order_id=new.id),'[]') else '[]' end,
 dispatch_reference=case when new.status='despachado' then 'Despacho '||new.number else dispatch_reference end
 where organization_id=new.organization_id and order_id=new.id;
 return new;
end $$;
revoke all on function private.sync_fulfillment() from public;
create trigger order_fulfillment_sync after update of status on public.orders for each row execute function private.sync_fulfillment();
commit;
