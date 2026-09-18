begin;
alter table public.products add column showcase_rank integer not null default 1000 check(showcase_rank>=0);
-- Editorial ordering only; visibility is still computed before choosing photographs.
update public.products set showcase_rank=array_position(array['J-6628','J-RZ023','J-8868E','J-YC-23035','J-708-44','J-LM258-22','J-XL806B','J-DK-2678','J-88105-3','BV-DK-5696','BCM-DK-3585','BEP-DK-6509','H-DK-4143','H-DK-3854','H-DK-4589','E-DK-4982','E-DK-FF-901','E-DK-DL5250','F-DK-5744','F-DK-5734','F-DK-5265','FE-DK-4709','FE-DK-2088'],sku) where sku=any(array['J-6628','J-RZ023','J-8868E','J-YC-23035','J-708-44','J-LM258-22','J-XL806B','J-DK-2678','J-88105-3','BV-DK-5696','BCM-DK-3585','BEP-DK-6509','H-DK-4143','H-DK-3854','H-DK-4589','E-DK-4982','E-DK-FF-901','E-DK-DL5250','F-DK-5744','F-DK-5734','F-DK-5265','FE-DK-4709','FE-DK-2088']) and organization_id in(select id from public.organizations where slug='dukes');
create or replace function public.browse_catalog(options jsonb default '{}') returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare invited_org uuid; approved boolean; result jsonb; skip integer:=least(greatest(coalesce((options->>'offset')::int,0),0),100000);
take integer:=least(greatest(coalesce((options->>'limit')::int,24),1),48);
qry text:=translate(lower(left(trim(coalesce(options->>'query','')),120)),'áéíóúüñ','aeiouun');
begin
 select exists(select 1 from public.memberships m join public.organizations o on o.id=m.organization_id where m.user_id=auth.uid() and m.status='active' and o.status='active') into approved;
 if not approved then
  select i.organization_id into invited_org from public.access_requests r join public.invitations i on i.id=r.invitation_id join public.organizations o on o.id=i.organization_id
  where r.user_id=auth.uid() and r.status='pending' and i.status='pending' and i.accepted_by=auth.uid() and i.expires_at>now() and o.status='active'
  and exists(select 1 from auth.users where id=auth.uid() and email_confirmed_at is not null)
  and not exists(select 1 from public.memberships where user_id=auth.uid() and status in ('suspended','rejected'));
 end if;
 if not approved and invited_org is null then
  raise exception 'Se requiere acceso aprobado' using errcode='42501';
 end if;
 with visible as materialized (
  select p.id,p.organization_id,o.name supplier_name,p.sku,p.title,p.category,p.price,p.image,p.active,p.pack_size,p.dimensions,p.showcase_rank
  from public.products p join public.organizations o on o.id=p.organization_id
  where p.active and o.status='active' and not o.is_test and (approved or p.organization_id=invited_org) and (
   exists(select 1 from public.catalog_publications c where c.organization_id=p.organization_id and c.product_id=p.id)
   or (coalesce(options->>'published','false')<>'true' and private.can_product(p.organization_id,p.id)))
 ), filtered as materialized (
  select *,row_number() over(partition by category order by showcase_rank,md5(sku),id) discovery_rank from visible
  where (coalesce(options->>'category','')='' or category=options->>'category')
   and (coalesce(options->>'supplier','')='' or organization_id::text=options->>'supplier')
   and (qry='' or position(qry in translate(lower(title||' '||sku||' '||category),'áéíóúüñ','aeiouun'))>0)
 ), page as (
  select * from filtered order by
   case when options->>'sort'='low' then price end asc,
   case when options->>'sort'='high' then price end desc,
   case when options->>'sort'='name' then title end,
   discovery_rank,md5(category),id limit take offset skip
 ), categories as (
  select category name,count(*) count,(array_agg(image order by showcase_rank,md5(sku),id) filter(where image is not null and image<>''))[1] image,(array_agg(image order by showcase_rank,md5(sku),id) filter(where image is not null and image<>''))[1:3] images
  from visible where (coalesce(options->>'supplier','')='' or organization_id::text=options->>'supplier') group by category
 ), suppliers as (select distinct organization_id id,supplier_name name from visible)
 select jsonb_build_object(
  'products',coalesce((select jsonb_agg(to_jsonb(p)-'discovery_rank') from page p),'[]'),
  'categories',coalesce((select jsonb_agg(to_jsonb(c) order by name) from categories c),'[]'),
  'suppliers',coalesce((select jsonb_agg(to_jsonb(s) order by name) from suppliers s),'[]'),
  'total',(select count(*) from filtered),'catalogTotal',(select count(*) from visible),
  'hasMore',(select count(*) from filtered)>skip+take) into result;
 return result;
end $$;

create or replace function public.commercial_portal(secret text, operation text default 'catalog', payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare a public.commercial_accesses; c public.clients; result jsonb; products jsonb; cats jsonb; history jsonb; q public.commercial_quotes;
item jsonb; product_row public.products; qty integer; unit_price numeric; amount numeric:=0; lines jsonb:='[]'; order_key uuid; submission_key uuid; existing public.orders; rate numeric; take integer; skip integer; qry text; cat text;
begin
 a:=private.commercial_access(secret);
 select * into c from public.clients where id=a.client_id;
 if payload is null or jsonb_typeof(payload)<>'object' or length(payload::text)>24000 then raise exception 'Solicitud inválida'; end if;
 if operation='catalog' then
  take:=least(greatest(coalesce((payload->>'limit')::int,24),1),60); skip:=least(greatest(coalesce((payload->>'offset')::int,0),0),100000);
  qry:=left(trim(coalesce(payload->>'query','')),120); cat:=coalesce(payload->>'category','');
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into products from (
   select p.id,p.sku,p.title,p.category,p.image,round(p.price*1.27) as price,'Unidad' as presentation,
    case when i.quantity is null then 'Por confirmar' when i.quantity-i.reserved>0 then 'Disponible' else 'Agotado' end as availability
   from (select source.*,row_number() over(partition by category order by showcase_rank,md5(sku),id) discovery_rank from private.portal_products(a) source) p left join public.inventory i on i.organization_id=p.organization_id and i.product_id=p.id
   where (cat='' or p.category=cat) and (qry='' or position(translate(lower(qry),'áéíóúüñ','aeiouun') in translate(lower(p.title||' '||p.sku||' '||p.category),'áéíóúüñ','aeiouun'))>0)
   and (coalesce(payload->>'replenish','false')<>'true' or exists(select 1 from public.order_items l join public.orders o on o.id=l.order_id where o.customer_id=a.client_id and o.status='entregado' and l.product_id=p.id))
   order by case when payload->>'personalized'='true' and p.category=any(c.interests) then 0 else 1 end,case when payload->>'sort'='price' then round(p.price*1.27) else 0 end,case when coalesce(payload->>'sort','')='' then p.discovery_rank else 0 end,md5(p.category),p.title,p.id limit take offset skip
  ) t;
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into cats from (select p.category as name,count(*) as count,(array_agg(p.image order by p.showcase_rank,md5(p.sku),p.id) filter(where p.image is not null and p.image<>''))[1] as image,(array_agg(p.image order by p.showcase_rank,md5(p.sku),p.id) filter(where p.image is not null and p.image<>''))[1:3] as images from private.portal_products(a) p group by p.category order by p.category) t;
  if skip=0 and (a.last_access_at is null or a.last_access_at<now()-interval '5 minutes') then update public.commercial_accesses set last_access_at=now(),access_count=access_count+1 where id=a.id; end if;
  return jsonb_build_object('name',c.name,'categories',cats,'products',products,'interests',c.interests,'preparedItems',a.prepared_items,'hasMore',jsonb_array_length(products)=take);
 elsif operation='preferences' then
  if jsonb_typeof(payload->'interests')<>'array' or jsonb_array_length(payload->'interests')>30 then raise exception 'Categorías inválidas'; end if;
  update public.clients set interests=array(select value from jsonb_array_elements_text(payload->'interests') where value in (select category from private.portal_products(a))) where id=c.id;
  return jsonb_build_object('ok',true);
 elsif operation='orders' then
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into history from (
   select o.id,o.number,o.status,o.total,o.created_at,(select jsonb_agg(jsonb_build_object('productId',l.product_id,'title',l.title,'quantity',l.quantity,'unitPrice',l.unit_price)) from public.order_items l where l.order_id=o.id) as items
   from public.orders o where o.customer_id=c.id and o.organization_id=a.organization_id order by o.created_at desc limit 30
  ) t;
  return jsonb_build_object('orders',history);
 elsif operation='quote' then
  if jsonb_typeof(payload->'items') is distinct from 'array' or jsonb_array_length(payload->'items') not between 1 and 100 then raise exception 'Selecciona productos'; end if;
  if (select count(distinct value->>'productId') from jsonb_array_elements(payload->'items'))<>jsonb_array_length(payload->'items') then raise exception 'Productos duplicados'; end if;
  perform pg_advisory_xact_lock(hashtextextended(a.id::text,0));
  if (select count(*) from public.commercial_quotes where access_id=a.id and created_at>now()-interval '1 hour')>=120 then raise exception 'Demasiadas cotizaciones. Reintenta más tarde'; end if;
  for item in select value from jsonb_array_elements(payload->'items') loop
   if coalesce(item->>'quantity','') !~ '^[0-9]{1,4}$' then raise exception 'Cantidad inválida'; end if;
   qty:=(item->>'quantity')::int;if qty<1 or qty>9999 then raise exception 'Cantidad inválida'; end if;
   select * into product_row from private.portal_products(a) where id=(item->>'productId')::uuid;
   if not found then raise exception 'Producto no habilitado' using errcode='42501'; end if;
   if exists(select 1 from public.inventory where organization_id=product_row.organization_id and product_id=product_row.id and quantity is not null and quantity-reserved<qty) then raise exception 'La cantidad supera la disponibilidad confirmada'; end if;
   unit_price:=round(product_row.price*case when qty>=48 then 1 when qty>=24 then 1.03 when qty>=12 then 1.08 when qty>=6 then 1.13 when qty>=3 then 1.18 else 1.27 end);
   lines:=lines||jsonb_build_array(jsonb_build_object('productId',product_row.id,'title',product_row.title,'quantity',qty,'unitPrice',unit_price));amount:=amount+unit_price*qty;
  end loop;
  insert into public.commercial_quotes(access_id,organization_id,client_id,lines,total) values(a.id,a.organization_id,c.id,lines,amount) returning * into q;
  return jsonb_build_object('id',q.id,'items',q.lines,'total',q.total,'expiresAt',q.expires_at);
 elsif operation='order' then
  submission_key:=(payload->>'requestKey')::uuid;if submission_key is null then raise exception 'Falta identificador'; end if;
  perform pg_advisory_xact_lock(hashtextextended(a.id::text,0));
  select * into existing from public.orders where commercial_access_id=a.id and orders.request_key=submission_key;
  if found then return jsonb_build_object('id',existing.id,'number',existing.number,'total',existing.total,'status',existing.status); end if;
  select * into q from public.commercial_quotes where id=(payload->>'quoteId')::uuid and access_id=a.id and client_id=c.id for update;
  if not found then raise exception 'Cotización no disponible' using errcode='42501'; end if;
  select * into existing from public.orders where commercial_quote_id=q.id;
  if found then return jsonb_build_object('id',existing.id,'number',existing.number,'total',existing.total,'status',existing.status); end if;
  if q.expires_at<=now() then raise exception 'Actualiza la cotización antes de enviar'; end if;
  if (select count(*) from public.orders where commercial_access_id=a.id and created_at>now()-interval '1 hour')>=20 then raise exception 'Demasiados pedidos. Contacta a tu vendedor'; end if;
  for item in select value from jsonb_array_elements(q.lines) loop
   if not exists(select 1 from private.portal_products(a) where id=(item->>'productId')::uuid) then raise exception 'Un producto ya no está habilitado. Revisa tu pedido'; end if;
  end loop;
  order_key:=gen_random_uuid();
  insert into public.orders(id,organization_id,number,customer_id,seller_id,total,status,request_key,commercial_access_id,commercial_quote_id,origin)
   values(order_key,a.organization_id,'SU-'||upper(substr(order_key::text,1,8)),c.id,a.seller_id,q.total,'recibido',submission_key,a.id,q.id,'commercial_portal');
  insert into public.order_items(organization_id,order_id,product_id,title,quantity,unit_price)
   select a.organization_id,order_key,(x->>'productId')::uuid,x->>'title',(x->>'quantity')::int,(x->>'unitPrice')::numeric from jsonb_array_elements(q.lines) x;
  select commission_rate into rate from public.organizations where id=a.organization_id;
  if a.seller_id is not null then insert into public.commissions(organization_id,order_id,seller_id,amount) values(a.organization_id,order_key,a.seller_id,round(q.total*rate,2)); end if;
  insert into public.order_events(organization_id,order_id,description) values(a.organization_id,order_key,'Pedido recibido desde el catálogo del comercio');
  return jsonb_build_object('id',order_key,'number','SU-'||upper(substr(order_key::text,1,8)),'total',q.total,'status','recibido');
 else raise exception 'Operación no permitida'; end if;
end $$;
commit;
