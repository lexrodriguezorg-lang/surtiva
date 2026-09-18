begin;
alter table public.clients add column contact_name text;
alter table public.clients add column phone text;
alter table public.clients add column interests text[] not null default '{}';
alter table public.clients add column created_at timestamptz not null default now();
alter table public.clients add column price_policy text not null default 'volume_v1' check(price_policy='volume_v1');

create table public.commercial_accesses (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, client_id uuid not null,
 seller_id uuid, created_by uuid not null references public.profiles,
 token_hash text not null unique check(length(token_hash)=64),
 status text not null default 'active' check(status in ('active','revoked')),
 created_at timestamptz not null default now(), expires_at timestamptz not null default now()+interval '90 days',
 last_access_at timestamptz, revoked_at timestamptz, access_count integer not null default 0,
 categories text[] not null default '{}', product_ids uuid[] not null default '{}', prepared_items jsonb not null default '[]',
 foreign key(organization_id,client_id) references public.clients(organization_id,id),
 foreign key(organization_id,seller_id) references public.sellers(organization_id,id), unique(organization_id,id)
);
create table public.commercial_quotes (
 id uuid primary key default gen_random_uuid(), access_id uuid not null references public.commercial_accesses,
 organization_id uuid not null, client_id uuid not null, lines jsonb not null,
 total numeric(14,2) not null check(total>0), created_at timestamptz not null default now(),
 expires_at timestamptz not null default now()+interval '10 minutes',
 foreign key(organization_id,client_id) references public.clients(organization_id,id)
);
alter table public.orders add column commercial_access_id uuid;
alter table public.orders add column commercial_quote_id uuid unique references public.commercial_quotes;
alter table public.orders add column origin text not null default 'workspace' check(origin in ('workspace','commercial_portal'));
alter table public.orders add foreign key(organization_id,commercial_access_id) references public.commercial_accesses(organization_id,id);
create unique index commercial_order_request on public.orders(commercial_access_id,request_key) where commercial_access_id is not null;
create index commercial_access_client on public.commercial_accesses(organization_id,client_id);
create index commercial_quote_access on public.commercial_quotes(access_id,created_at);
alter table public.commercial_accesses enable row level security;
alter table public.commercial_quotes enable row level security;
revoke all on public.commercial_accesses,public.commercial_quotes from public,anon,authenticated;
-- Hashes, contact data and quote snapshots are never directly available to anon.
grant select(id,organization_id,client_id,seller_id,created_by,status,created_at,expires_at,last_access_at,revoked_at,access_count,categories,product_ids) on public.commercial_accesses to authenticated;
create policy commercial_access_read on public.commercial_accesses for select to authenticated using(private.scope(organization_id,seller_id));

create function private.can_visit(org uuid, seller uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.organizations where id=org and kind='distribuidor' and status='active')
 and (private.is_admin() or private.member_role(org)='distributor_admin' or
 exists(select 1 from public.memberships where organization_id=org and user_id=auth.uid() and role_id='seller' and status='active' and seller_id=seller));
$$;
revoke all on function private.can_visit(uuid,uuid) from public,anon;
grant execute on function private.can_visit(uuid,uuid) to authenticated;

create function public.create_commercial_access(org uuid, client_key uuid, options jsonb default '{}') returns jsonb
language plpgsql security definer set search_path='' as $$
declare c public.clients; secret text; access_key uuid:=gen_random_uuid(); cats text[]; products uuid[]; item jsonb;
begin
 select * into c from public.clients where organization_id=org and id=client_key and status='active' for update;
 if not found or not coalesce(private.can_visit(org,c.seller_id),false) then raise exception 'Comercio no autorizado' using errcode='42501'; end if;
 if jsonb_typeof(options)<>'object' or length(options::text)>16000 then raise exception 'Selección inválida'; end if;
 select coalesce(array_agg(value),'{}') into cats from jsonb_array_elements_text(coalesce(options->'categories','[]'));
 select coalesce(array_agg(value::uuid),'{}') into products from jsonb_array_elements_text(coalesce(options->'products','[]'));
 if cardinality(cats)>30 or cardinality(products)>100 then raise exception 'Selección demasiado grande'; end if;
 if exists(select 1 from unnest(products) p where not exists(select 1 from public.products q where q.id=p and q.organization_id=org and q.active and (exists(select 1 from public.catalog_publications cp where cp.product_id=q.id) or exists(select 1 from public.catalog_access ca where ca.product_id=q.id and ca.customer_id=c.id)))) then raise exception 'Producto no habilitado'; end if;
 if jsonb_typeof(coalesce(options->'items','[]'))<>'array' or jsonb_array_length(coalesce(options->'items','[]'))>100 then raise exception 'Selección inválida'; end if;
 for item in select value from jsonb_array_elements(coalesce(options->'items','[]')) loop
  if not ((item->>'productId')::uuid=any(products)) or (item->>'quantity') !~ '^[0-9]{1,4}$' or (item->>'quantity')::int<1 then raise exception 'Cantidad o producto inválido'; end if;
 end loop;
 if (select count(*) from public.commercial_accesses where client_id=c.id and created_at>now()-interval '1 hour')>=30 then raise exception 'Demasiados enlaces. Reintenta más tarde'; end if;
 secret:=replace(gen_random_uuid()::text||gen_random_uuid()::text||gen_random_uuid()::text,'-','');
 insert into public.commercial_accesses(id,organization_id,client_id,seller_id,created_by,token_hash,categories,product_ids,prepared_items)
 values(access_key,org,c.id,c.seller_id,auth.uid(),encode(sha256(convert_to(secret,'UTF8')),'hex'),cats,products,coalesce(options->'items','[]'));
 insert into public.audit_events(organization_id,actor_id,action,target_id) values(org,auth.uid(),'commercial_access.create',access_key);
 return jsonb_build_object('id',access_key,'clientId',c.id,'name',c.name,'token',secret,'expiresAt',now()+interval '90 days');
end $$;

create function public.preregister_merchant(org uuid, payload jsonb) returns jsonb language plpgsql security definer set search_path='' as $$
declare merchant uuid:=gen_random_uuid(); client_key uuid:=gen_random_uuid(); seller_key uuid; nm text:=trim(payload->>'name'); contact text:=trim(payload->>'contact'); phone text:=trim(payload->>'phone'); city text:=trim(payload->>'city');
begin
 if private.member_role(org)='seller' then select seller_id into seller_key from public.memberships where organization_id=org and user_id=auth.uid();
 else seller_key:=nullif(payload->>'sellerId','')::uuid; end if;
 if not coalesce(private.can_visit(org,seller_key),false) then raise exception 'No autorizado' using errcode='42501'; end if;
 if not (coalesce(length(nm),0) between 1 and 120 and coalesce(length(contact),0) between 1 and 100 and coalesce(length(city),0) between 1 and 100 and coalesce(phone,'') ~ '^\+?[0-9 ()-]{7,24}$') then raise exception 'Completa negocio, contacto, celular y ciudad'; end if;
 if seller_key is not null and not exists(select 1 from public.sellers where id=seller_key and organization_id=org) then raise exception 'Vendedor inválido'; end if;
 -- A commercial prospect is not an approved software tenant or Auth user.
 insert into public.organizations(id,name,slug,kind,status,is_test) select merchant,nm,'merchant-'||merchant,'comercio','pending',is_test from public.organizations where id=org;
 insert into public.clients(id,organization_id,name,city,seller_id,merchant_organization_id,status,contact_name,phone)
 values(client_key,org,nm,city,seller_key,merchant,'active',contact,phone);
 insert into public.organization_relationships(organization_id,partner_organization_id,kind,status) values(org,merchant,'merchant','active');
 insert into public.audit_events(organization_id,actor_id,action,target_id) values(org,auth.uid(),'merchant.preregister',client_key);
 return public.create_commercial_access(org,client_key);
end $$;

create function public.revoke_commercial_access(access_key uuid) returns void language plpgsql security definer set search_path='' as $$
declare a public.commercial_accesses; c public.clients; begin
 select * into a from public.commercial_accesses where id=access_key for update;
 select * into c from public.clients where id=a.client_id;
 if a.id is null or not coalesce(private.can_visit(a.organization_id,c.seller_id),false) then raise exception 'No autorizado' using errcode='42501'; end if;
 update public.commercial_accesses set status='revoked',revoked_at=now() where id=a.id;
 insert into public.audit_events(organization_id,actor_id,action,target_id) values(a.organization_id,auth.uid(),'commercial_access.revoke',a.id);
end $$;

-- Capability verification is independent of any user session sent by the browser.
create function private.commercial_access(secret text) returns public.commercial_accesses language plpgsql security definer set search_path='' as $$
declare a public.commercial_accesses; begin
 if secret is null or secret !~ '^[a-f0-9]{96}$' then raise exception 'Enlace no disponible' using errcode='42501'; end if;
 select x.* into a from public.commercial_accesses x
 join public.clients c on c.id=x.client_id and c.organization_id=x.organization_id
 join public.organizations d on d.id=x.organization_id
 join public.organizations m on m.id=c.merchant_organization_id
 where x.token_hash=encode(sha256(convert_to(secret,'UTF8')),'hex') and x.status='active' and x.expires_at>now()
 and d.status='active' and c.status='active' and m.status in ('pending','active')
 and c.seller_id is not distinct from x.seller_id
 and exists(select 1 from public.organization_relationships r where r.organization_id=d.id and r.partner_organization_id=m.id and r.kind='merchant' and r.status='active')
 and exists(select 1 from public.memberships u join public.organizations o on o.id=u.organization_id where u.user_id=x.created_by and u.status='active' and o.status='active' and
 ((u.role_id='surtiva_admin' and o.kind='plataforma') or (u.organization_id=x.organization_id and (u.role_id='distributor_admin' or (u.role_id='seller' and u.seller_id=x.seller_id))))) for update of x;
 if not found then raise exception 'Enlace no disponible' using errcode='42501'; end if;
 return a;
end $$;
revoke all on function private.commercial_access(text) from public,anon,authenticated;

create function private.portal_products(a public.commercial_accesses) returns setof public.products language sql stable security definer set search_path='' as $$
 select p.* from public.products p where p.organization_id=a.organization_id and p.active and p.price>0
 and (cardinality(a.categories)=0 or p.category=any(a.categories)) and (cardinality(a.product_ids)=0 or p.id=any(a.product_ids))
 and (exists(select 1 from public.catalog_publications cp where cp.product_id=p.id) or exists(select 1 from public.catalog_access ca where ca.product_id=p.id and ca.customer_id=a.client_id));
$$;
revoke all on function private.portal_products(public.commercial_accesses) from public,anon,authenticated;

create function public.commercial_portal(secret text, operation text default 'catalog', payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
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
   from private.portal_products(a) p left join public.inventory i on i.organization_id=p.organization_id and i.product_id=p.id
   where (cat='' or p.category=cat) and (qry='' or position(lower(qry) in lower(p.title||' '||p.sku||' '||p.category))>0)
   and (coalesce(payload->>'replenish','false')<>'true' or exists(select 1 from public.order_items l join public.orders o on o.id=l.order_id where o.customer_id=a.client_id and o.status='entregado' and l.product_id=p.id))
   order by case when payload->>'sort'='price' then round(p.price*1.27) else 0 end,p.title,p.id limit take offset skip
  ) t;
  select coalesce(jsonb_agg(to_jsonb(t)),'[]') into cats from (select p.category as name,count(*) as count from private.portal_products(a) p group by p.category order by p.category) t;
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
revoke all on function public.preregister_merchant(uuid,jsonb),public.create_commercial_access(uuid,uuid,jsonb),public.revoke_commercial_access(uuid) from public,anon;
grant execute on function public.preregister_merchant(uuid,jsonb),public.create_commercial_access(uuid,uuid,jsonb),public.revoke_commercial_access(uuid) to authenticated;
revoke all on function public.commercial_portal(text,text,jsonb) from public;
grant execute on function public.commercial_portal(text,text,jsonb) to anon,authenticated;
commit;
