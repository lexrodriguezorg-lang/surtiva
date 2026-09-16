begin;

-- Evolve the existing schema without discarding commercial records.
alter table public.customers rename to clients;
alter table public.fulfillment_points rename to fulfillment_nodes;
alter table public.order_lines rename to order_items;
alter table public.receivables rename to invoices;

create table public.organization_plans (
 code text primary key, name text not null,
 limits jsonb not null default '{}', active boolean not null default true
);
insert into public.organization_plans values ('pilot','Piloto','{}',true);
alter table public.organizations drop constraint organizations_kind_check;
alter table public.organizations add constraint organizations_kind_check check(kind in ('plataforma','distribuidor','comercio','cumplimiento'));
alter table public.organizations add column status text not null default 'pending' check(status in ('pending','active','suspended','rejected'));
update public.organizations set status=case when active then 'active' else 'suspended' end;
alter table public.organizations add column plan_code text not null default 'pilot' references public.organization_plans;
alter table public.organizations add column is_test boolean not null default false;
alter table public.memberships add column status text not null default 'pending' check(status in ('pending','active','suspended','rejected'));
update public.memberships set status=case when active then 'active' else 'suspended' end;

-- Keep the former boolean compatible during a rolling application deployment.
create function private.sync_account_status() returns trigger language plpgsql set search_path='' as $$
begin
 if TG_OP='UPDATE' and new.active is distinct from old.active and new.status=old.status then
  new.status:=case when new.active then 'active' else 'suspended' end;
 end if;
 new.active:=new.status='active'; return new;
end $$;
create trigger organization_status before insert or update on public.organizations for each row execute function private.sync_account_status();
create trigger membership_status before insert or update on public.memberships for each row execute function private.sync_account_status();

alter table public.access_requests drop constraint access_requests_status_check;
update public.access_requests set status=case status when 'pendiente' then 'pending' when 'aprobada' then 'active' else 'rejected' end;
alter table public.access_requests alter column status set default 'pending';
alter table public.access_requests add constraint access_requests_status_check check(status in ('pending','active','suspended','rejected'));
alter table public.access_requests add column review_note text;

insert into public.roles values ('surtiva_admin','Administrador Surtiva'),('distributor_admin','Distribuidor'),('seller','Vendedor'),('merchant','Comercio'),('fulfillment_partner','Aliado de cumplimiento');
alter table public.memberships drop constraint memberships_check;
update public.memberships set role_id=case role_id when 'distribuidor' then 'distributor_admin' when 'vendedor' then 'seller' when 'comercio' then 'merchant' when 'aliado' then 'fulfillment_partner' end;
update public.access_requests set requested_role=case requested_role when 'distribuidor' then 'distributor_admin' when 'vendedor' then 'seller' when 'comercio' then 'merchant' when 'aliado' then 'fulfillment_partner' end;
update public.role_permissions set role_id=case role_id when 'distribuidor' then 'distributor_admin' when 'vendedor' then 'seller' when 'comercio' then 'merchant' when 'aliado' then 'fulfillment_partner' end;
delete from public.roles where id in ('distribuidor','vendedor','comercio','aliado');
insert into public.role_permissions select 'surtiva_admin',id from public.permissions;

-- A client record is a distributor's trading account, not the merchant's tenant.
alter table public.clients add column merchant_organization_id uuid references public.organizations;
alter table public.clients add column status text not null default 'pending' check(status in ('pending','active','suspended','rejected'));
insert into public.organizations(id,name,slug,kind,status,is_example)
 select c.id,c.name,'merchant-'||c.id,'comercio','active',o.is_example from public.clients c join public.organizations o on o.id=c.organization_id;
update public.clients set merchant_organization_id=id,status='active';
alter table public.clients alter column merchant_organization_id set not null;
alter table public.clients add constraint clients_distinct_organizations check(merchant_organization_id<>organization_id);
create unique index client_relationship on public.clients(organization_id,merchant_organization_id);

-- Preserve existing node identifiers while moving ownership to the partner.
create table public.organization_relationships (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations,
 partner_organization_id uuid not null references public.organizations,
 kind text not null check(kind in ('merchant','fulfillment_partner')),
 status text not null default 'pending' check(status in ('pending','active','suspended','rejected')),
 created_at timestamptz not null default now(),
 unique(organization_id,partner_organization_id,kind), check(organization_id<>partner_organization_id)
);
insert into public.organization_relationships(organization_id,partner_organization_id,kind,status)
 select organization_id,merchant_organization_id,'merchant',status from public.clients;
insert into public.organizations(id,name,slug,kind,status,is_example)
 select n.id,n.name,'partner-'||n.id,'cumplimiento','active',o.is_example from public.fulfillment_nodes n join public.organizations o on o.id=n.organization_id;
insert into public.organization_relationships(organization_id,partner_organization_id,kind,status)
 select organization_id,id,'fulfillment_partner','active' from public.fulfillment_nodes;

alter table public.memberships drop constraint memberships_organization_id_customer_id_fkey;
alter table public.memberships drop constraint memberships_organization_id_fulfillment_point_id_fkey;
update public.memberships m set organization_id=c.merchant_organization_id,customer_id=null from public.clients c where m.role_id='merchant' and m.customer_id=c.id;
update public.memberships set organization_id=fulfillment_point_id,fulfillment_point_id=null where role_id='fulfillment_partner';
alter table public.memberships add constraint membership_assignment check(
 (role_id='seller' and seller_id is not null and customer_id is null and fulfillment_point_id is null)
 or (role_id in ('surtiva_admin','distributor_admin','merchant','fulfillment_partner') and seller_id is null and customer_id is null and fulfillment_point_id is null));
alter table public.orders drop constraint orders_organization_id_fulfillment_point_id_fkey;
alter table public.fulfillment_records drop constraint fulfillment_records_organization_id_fulfillment_point_id_fkey;
update public.fulfillment_nodes set organization_id=id;
alter table public.orders add constraint orders_node_fkey foreign key(fulfillment_point_id) references public.fulfillment_nodes(id);
alter table public.fulfillment_records add constraint fulfillment_records_node_fkey foreign key(fulfillment_point_id) references public.fulfillment_nodes(id);

-- Platform authority is a membership of Surtiva, never a distributor property.
insert into public.organizations(id,name,slug,kind,status) values('00000000-0000-4000-8000-000000000100','Surtiva','surtiva','plataforma','active');
insert into public.memberships(organization_id,user_id,role_id,status)
 select '00000000-0000-4000-8000-000000000100',user_id,'surtiva_admin',case when active then 'active' else 'suspended' end from public.platform_admins;

create or replace function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.memberships m join public.organizations o on o.id=m.organization_id
 where m.user_id=(select auth.uid()) and m.role_id='surtiva_admin' and m.status='active' and o.status='active' and o.kind='plataforma');
$$;
create or replace function private.member_role(org uuid) returns text language sql stable security definer set search_path='' as $$
 select m.role_id from public.memberships m join public.organizations o on o.id=m.organization_id
 where m.organization_id=org and m.user_id=(select auth.uid()) and m.status='active' and o.status='active';
$$;
create function private.is_merchant(org uuid, client uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.clients c join public.organizations d on d.id=c.organization_id
 where c.organization_id=org and c.id=client and c.status='active' and d.status='active' and private.member_role(c.merchant_organization_id)='merchant');
$$;
create function private.is_partner(org uuid, node uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.fulfillment_nodes n join public.organization_relationships r on r.partner_organization_id=n.organization_id
 join public.organizations d on d.id=r.organization_id where n.id=node and r.organization_id=org and r.kind='fulfillment_partner'
 and r.status='active' and d.status='active' and private.member_role(n.organization_id)='fulfillment_partner');
$$;
create or replace function private.scope(org uuid, seller uuid default null, customer uuid default null, point uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin() or coalesce(private.member_role(org)='distributor_admin',false)
 or exists(select 1 from public.memberships m where m.organization_id=org and m.user_id=(select auth.uid()) and m.seller_id=seller and private.member_role(org)='seller')
 or private.is_merchant(org,customer) or private.is_partner(org,point);
$$;

-- Update stored SQL references; policies/FKs already track renamed relations by OID.
do $$ declare f record; definition text; begin
 for f in select p.oid from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname in ('public','private') and p.proname in ('can_product','can_order','register_identity','review_access','create_order','transition_order','create_entity','set_catalog_access','assign_fulfillment','sync_fulfillment','record_local_sale') loop
  definition:=pg_get_functiondef(f.oid);
  definition:=replace(replace(replace(replace(definition,'public.customers','public.clients'),'public.fulfillment_points','public.fulfillment_nodes'),'public.order_lines','public.order_items'),'public.receivables','public.invoices');
  definition:=replace(replace(replace(replace(definition,'''distribuidor''','''distributor_admin'''),'''vendedor''','''seller'''),'''comercio''','''merchant'''),'''aliado''','''fulfillment_partner''');
  execute definition;
 end loop;
end $$;

create function private.validate_membership() returns trigger language plpgsql security definer set search_path='' as $$
declare k text; begin
 select kind into k from public.organizations where id=new.organization_id;
 if not coalesce((new.role_id='surtiva_admin' and k='plataforma') or (new.role_id in ('distributor_admin','seller') and k='distribuidor')
 or (new.role_id='merchant' and k='comercio') or (new.role_id='fulfillment_partner' and k='cumplimiento'),false) then raise exception 'El rol no corresponde a esta organización'; end if;
 return new;
end $$;
create trigger membership_kind before insert or update on public.memberships for each row execute function private.validate_membership();

create table public.distributor_products (
 organization_id uuid not null, product_id uuid not null, enabled boolean not null default true,
 price numeric(14,2) not null check(price>=0), primary key(organization_id,product_id),
 foreign key(organization_id,product_id) references public.products(organization_id,id)
);
insert into public.distributor_products select organization_id,id,active,price from public.products;
create function private.sync_product_listing() returns trigger language plpgsql security definer set search_path='' as $$
begin
 insert into public.distributor_products(organization_id,product_id,enabled,price) values(new.organization_id,new.id,new.active,new.price)
 on conflict(organization_id,product_id) do update set enabled=excluded.enabled,price=excluded.price;
 return new;
end $$;
create trigger product_listing after insert or update of active,price on public.products for each row execute function private.sync_product_listing();

-- Merchant inventory/sales are owned by the merchant, retaining supplier provenance.
alter table public.retail_inventory add column distributor_organization_id uuid references public.organizations;
alter table public.local_sales add column distributor_organization_id uuid references public.organizations;
alter table public.retail_inventory drop constraint retail_inventory_organization_id_customer_id_fkey;
alter table public.retail_inventory drop constraint retail_inventory_organization_id_product_id_fkey;
alter table public.local_sales drop constraint local_sales_organization_id_customer_id_fkey;
update public.retail_inventory r set distributor_organization_id=r.organization_id,organization_id=c.merchant_organization_id from public.clients c where c.id=r.customer_id;
update public.local_sales r set distributor_organization_id=r.organization_id,organization_id=c.merchant_organization_id from public.clients c where c.id=r.customer_id;
alter table public.retail_inventory alter column distributor_organization_id set not null;
alter table public.local_sales alter column distributor_organization_id set not null;
alter table public.retail_inventory add foreign key(distributor_organization_id,customer_id) references public.clients(organization_id,id);
alter table public.retail_inventory add foreign key(distributor_organization_id,product_id) references public.products(organization_id,id);
alter table public.local_sales add foreign key(distributor_organization_id,customer_id) references public.clients(organization_id,id);
alter table public.retail_inventory add foreign key(organization_id) references public.organizations;
alter table public.local_sales add foreign key(organization_id) references public.organizations;

drop policy retail_read on public.retail_inventory;
drop policy retail_edit on public.retail_inventory;
drop policy local_sale_read on public.local_sales;
create policy retail_read on public.retail_inventory for select to authenticated using(private.is_admin() or private.member_role(organization_id)='merchant');
create policy retail_edit on public.retail_inventory for update to authenticated using(private.is_admin() or private.member_role(organization_id)='merchant') with check(private.is_admin() or private.member_role(organization_id)='merchant');
create policy local_sale_read on public.local_sales for select to authenticated using(private.is_admin() or private.member_role(organization_id)='merchant');
drop policy point_read on public.fulfillment_nodes;
create policy point_read on public.fulfillment_nodes for select to authenticated using(private.is_admin() or private.member_role(organization_id)='fulfillment_partner'
 or exists(select 1 from public.organization_relationships r where r.partner_organization_id=fulfillment_nodes.organization_id and r.kind='fulfillment_partner' and r.status='active' and private.member_role(r.organization_id)='distributor_admin'));

do $$ declare t text; begin
 foreach t in array array['organization_plans','organization_relationships','distributor_products'] loop
  execute format('alter table public.%I enable row level security',t);
  execute format('revoke all on public.%I from anon,authenticated',t);
  execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy plans_read on public.organization_plans for select to authenticated using(private.is_admin() or exists(select 1 from public.organizations o where o.plan_code=code and private.member_role(o.id) is not null));
create policy relationship_read on public.organization_relationships for select to authenticated using(private.is_admin() or private.member_role(organization_id)='distributor_admin' or private.member_role(partner_organization_id) in ('merchant','fulfillment_partner'));
create policy listing_read on public.distributor_products for select to authenticated using(private.scope(organization_id) or (enabled and private.can_product(organization_id,product_id)));

create index clients_merchant on public.clients(merchant_organization_id,status);
create index relationship_partner on public.organization_relationships(partner_organization_id,status);
create index nodes_organization on public.fulfillment_nodes(organization_id);
revoke all on all functions in schema private from public,anon;
grant execute on all functions in schema private to authenticated;
commit;
