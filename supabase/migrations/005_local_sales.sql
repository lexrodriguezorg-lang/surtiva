begin;
alter table public.local_sales add column request_key uuid;
create unique index local_sales_request on public.local_sales(organization_id,customer_id,request_key) where request_key is not null;
create function public.record_local_sale(org uuid, customer_key uuid, items jsonb, sale_key uuid) returns uuid language plpgsql security definer set search_path='' as $$
declare sale uuid:=gen_random_uuid(); existing uuid; item jsonb; inv public.retail_inventory; qty integer; amount numeric:=0; snapshot jsonb:='[]'; product_title text;
begin
 if not private.scope(org,null,customer_key) then raise exception 'Comercio no autorizado' using errcode='42501'; end if;
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
  select title into product_title from public.products where organization_id=org and id=inv.product_id;
  update public.retail_inventory set quantity=quantity-qty where organization_id=org and customer_id=customer_key and product_id=inv.product_id;
  amount:=amount+qty*inv.price;snapshot:=snapshot||jsonb_build_array(jsonb_build_object('productId',inv.product_id,'title',product_title,'quantity',qty,'unitPrice',inv.price));
 end loop;
 insert into public.local_sales(id,organization_id,customer_id,total,lines,request_key) values(sale,org,customer_key,amount,snapshot,sale_key);
 return sale;
end $$;
revoke all on function public.record_local_sale(uuid,uuid,jsonb,uuid) from public,anon;
grant execute on function public.record_local_sale(uuid,uuid,jsonb,uuid) to authenticated;
commit;
