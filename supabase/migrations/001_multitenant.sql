begin;
create schema if not exists private;
revoke all on schema private from public;
grant usage on schema private to authenticated;

create table public.profiles (
 id uuid primary key references auth.users(id) on delete cascade,
 name text not null check (length(name) between 1 and 100), created_at timestamptz not null default now()
);
create table public.platform_admins (user_id uuid primary key references public.profiles(id), active boolean not null default true);
create table public.organizations (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 120),
 slug text unique not null, kind text not null check(kind in ('distribuidor','comercio','cumplimiento')),
 active boolean not null default true, is_example boolean not null default false, created_at timestamptz not null default now()
);
create table public.roles (id text primary key, label text not null);
insert into public.roles values ('distribuidor','Distribuidor'),('vendedor','Vendedor'),('comercio','Comercio'),('aliado','Punto de cumplimiento');
create table public.permissions (id text primary key);
insert into public.permissions values ('catalog.read'),('inventory.manage'),('orders.read'),('orders.create'),('orders.fulfill'),('customers.read'),('team.read'),('suppliers.read'),('commissions.read'),('followups.manage'),('receivables.read'),('retail.manage'),('fulfillment.read');
create table public.role_permissions (role_id text references public.roles, permission_id text references public.permissions, primary key(role_id,permission_id));
insert into public.role_permissions select 'distribuidor',id from public.permissions;
insert into public.role_permissions values
 ('vendedor','catalog.read'),('vendedor','orders.read'),('vendedor','orders.create'),('vendedor','customers.read'),('vendedor','commissions.read'),('vendedor','followups.manage'),
 ('comercio','catalog.read'),('comercio','orders.read'),('comercio','orders.create'),('comercio','receivables.read'),('comercio','retail.manage'),
 ('aliado','orders.read'),('aliado','orders.fulfill'),('aliado','fulfillment.read');

create table public.sellers (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations, name text not null, territory text, legacy_id text, unique(organization_id,id), unique(organization_id,legacy_id));
create table public.fulfillment_points (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations, name text not null, city text, legacy_id text, unique(organization_id,id), unique(organization_id,legacy_id));
create table public.customers (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations,
 name text not null, city text, seller_id uuid, legacy_id text, credit_limit numeric(14,2) not null default 0 check(credit_limit>=0),
 unique(organization_id,id), unique(organization_id,legacy_id), foreign key(organization_id,seller_id) references public.sellers(organization_id,id)
);
create table public.memberships (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations,
 user_id uuid not null references public.profiles, role_id text not null references public.roles,
 active boolean not null default true, seller_id uuid, customer_id uuid, fulfillment_point_id uuid,
 unique(organization_id,user_id),
 foreign key(organization_id,seller_id) references public.sellers(organization_id,id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id),
 foreign key(organization_id,fulfillment_point_id) references public.fulfillment_points(organization_id,id),
 check((role_id='distribuidor' and seller_id is null and customer_id is null and fulfillment_point_id is null)
 or (role_id='vendedor' and seller_id is not null and customer_id is null and fulfillment_point_id is null)
 or (role_id='comercio' and customer_id is not null and seller_id is null and fulfillment_point_id is null)
 or (role_id='aliado' and fulfillment_point_id is not null and seller_id is null and customer_id is null))
);
create table public.suppliers (id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations, name text not null, contact text, unique(organization_id,id));
create table public.products (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations,
 sku text not null, title text not null, category text not null, price numeric(14,2) not null check(price>=0),
 image text, active boolean not null default true, pack_size integer, dimensions text, source jsonb not null default '{}',
 unique(organization_id,id), unique(organization_id,sku)
);
create table public.product_suppliers (
 organization_id uuid not null, product_id uuid not null, supplier_id uuid not null,
 primary key(organization_id,product_id,supplier_id),
 foreign key(organization_id,product_id) references public.products(organization_id,id),
 foreign key(organization_id,supplier_id) references public.suppliers(organization_id,id)
);
create table public.catalog_access (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, product_id uuid not null, seller_id uuid, customer_id uuid,
 check((seller_id is not null)::int + (customer_id is not null)::int=1),
 foreign key(organization_id,product_id) references public.products(organization_id,id),
 foreign key(organization_id,seller_id) references public.sellers(organization_id,id),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id),
 unique nulls not distinct(organization_id,product_id,seller_id,customer_id)
);
create table public.inventory (
 organization_id uuid not null, product_id uuid not null, quantity integer check(quantity>=0), reserved integer not null default 0 check(reserved>=0),
 origin text not null default 'por_confirmar', primary key(organization_id,product_id),
 check(quantity is null or reserved<=quantity), foreign key(organization_id,product_id) references public.products(organization_id,id)
);
create table public.orders (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null references public.organizations,
 number text not null, customer_id uuid not null, seller_id uuid, fulfillment_point_id uuid,
 status text not null default 'recibido' check(status in ('aprobacion','recibido','preparando','despachado','entregado','cancelado','rechazado')),
 total numeric(14,2) not null check(total>=0), discount numeric(14,2) not null default 0 check(discount>=0),
 is_example boolean not null default false, created_by uuid references public.profiles, created_at timestamptz not null default now(),
 unique(organization_id,id), unique(organization_id,number),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id),
 foreign key(organization_id,seller_id) references public.sellers(organization_id,id),
 foreign key(organization_id,fulfillment_point_id) references public.fulfillment_points(organization_id,id)
);
create table public.order_lines (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, order_id uuid not null, product_id uuid not null,
 title text not null, quantity integer not null check(quantity>0), unit_price numeric(14,2) not null check(unit_price>=0),
 foreign key(organization_id,order_id) references public.orders(organization_id,id),
 foreign key(organization_id,product_id) references public.products(organization_id,id)
);
create table public.order_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, order_id uuid not null,
 description text not null, actor_id uuid references public.profiles, created_at timestamptz not null default now(),
 foreign key(organization_id,order_id) references public.orders(organization_id,id)
);
create table public.commissions (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, order_id uuid not null, seller_id uuid not null,
 amount numeric(14,2) not null check(amount>=0), status text not null default 'proyectada',
 foreign key(organization_id,order_id) references public.orders(organization_id,id),
 foreign key(organization_id,seller_id) references public.sellers(organization_id,id), unique(organization_id,order_id,seller_id)
);
create table public.followups (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, customer_id uuid not null, seller_id uuid not null,
 note text not null check(length(note) between 1 and 2000), next_date date, created_at timestamptz not null default now(),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id), foreign key(organization_id,seller_id) references public.sellers(organization_id,id)
);
create table public.receivables (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, order_id uuid not null, customer_id uuid not null,
 number text not null, total numeric(14,2) not null check(total>=0), paid numeric(14,2) not null default 0 check(paid>=0 and paid<=total), due_date date,
 unique(organization_id,number), foreign key(organization_id,order_id) references public.orders(organization_id,id), foreign key(organization_id,customer_id) references public.customers(organization_id,id)
);
create table public.retail_inventory (
 organization_id uuid not null, customer_id uuid not null, product_id uuid not null,
 quantity integer not null check(quantity>=0), price numeric(14,2) not null check(price>=0), published boolean not null default false,
 primary key(organization_id,customer_id,product_id), foreign key(organization_id,customer_id) references public.customers(organization_id,id), foreign key(organization_id,product_id) references public.products(organization_id,id)
);
create table public.local_sales (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, customer_id uuid not null,
 total numeric(14,2) not null check(total>=0), lines jsonb not null, created_at timestamptz not null default now(),
 foreign key(organization_id,customer_id) references public.customers(organization_id,id)
);
create table public.fulfillment_records (
 id uuid primary key default gen_random_uuid(), organization_id uuid not null, order_id uuid not null, fulfillment_point_id uuid not null,
 committed_stock jsonb not null default '[]', dispatch_reference text, payment_status text not null default 'sin_registro', reconciliation_status text not null default 'pendiente',
 foreign key(organization_id,order_id) references public.orders(organization_id,id), foreign key(organization_id,fulfillment_point_id) references public.fulfillment_points(organization_id,id)
);
create table public.access_requests (
 id uuid primary key default gen_random_uuid(), user_id uuid not null unique references public.profiles,
 organization_name text not null check(length(organization_name) between 1 and 120), requested_role text not null references public.roles,
 status text not null default 'pendiente' check(status in ('pendiente','aprobada','rechazada')),
 organization_id uuid references public.organizations, reviewed_by uuid references public.profiles,
 reviewed_at timestamptz, created_at timestamptz not null default now()
);
create table public.audit_events (
 id uuid primary key default gen_random_uuid(), organization_id uuid references public.organizations,
 actor_id uuid references public.profiles, action text not null, target_id uuid, created_at timestamptz not null default now()
);

create function private.is_admin() returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.platform_admins where user_id=(select auth.uid()) and active);
$$;
create function private.member_role(org uuid) returns text language sql stable security definer set search_path='' as $$
 select m.role_id from public.memberships m join public.organizations o on o.id=m.organization_id
 where m.organization_id=org and m.user_id=(select auth.uid()) and m.active and o.active;
$$;
create function private.scope(org uuid, seller uuid default null, customer uuid default null, point uuid default null) returns boolean language sql stable security definer set search_path='' as $$
 select private.is_admin() or exists(select 1 from public.memberships m join public.organizations o on o.id=m.organization_id
 where m.organization_id=org and m.user_id=(select auth.uid()) and m.active and o.active and
 (m.role_id='distribuidor' or (m.role_id='vendedor' and m.seller_id=seller) or (m.role_id='comercio' and m.customer_id=customer) or (m.role_id='aliado' and m.fulfillment_point_id=point)));
$$;
create function private.can_product(org uuid, product uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.scope(org) or exists(select 1 from public.catalog_access a where a.organization_id=org and a.product_id=product and private.scope(org,a.seller_id,a.customer_id));
$$;
create function private.can_order(org uuid, order_key uuid) returns boolean language sql stable security definer set search_path='' as $$
 select exists(select 1 from public.orders o where o.organization_id=org and o.id=order_key and private.scope(org,o.seller_id,o.customer_id,o.fulfillment_point_id));
$$;
revoke all on all functions in schema private from public;
grant execute on all functions in schema private to authenticated;

-- Revoke default Supabase grants and enable RLS before allowing any reads.
do $$ declare t text; begin
 foreach t in array array['profiles','platform_admins','organizations','roles','permissions','role_permissions','sellers','fulfillment_points','customers','memberships','suppliers','products','product_suppliers','catalog_access','inventory','orders','order_lines','order_events','commissions','followups','receivables','retail_inventory','local_sales','fulfillment_records','access_requests','audit_events'] loop
 execute format('alter table public.%I enable row level security',t);
 execute format('revoke all on public.%I from anon, authenticated',t);
 execute format('grant select on public.%I to authenticated',t);
 end loop;
end $$;
create policy profile_read on public.profiles for select to authenticated using(id=auth.uid() or private.is_admin());
create policy admin_read on public.platform_admins for select to authenticated using(user_id=auth.uid() and active);
create policy organization_read on public.organizations for select to authenticated using(private.is_admin() or private.member_role(id) is not null);
create policy membership_read on public.memberships for select to authenticated using(user_id=auth.uid() or private.scope(organization_id));
create policy role_read on public.roles for select to authenticated using(true);
create policy permission_read on public.permissions for select to authenticated using(true);
create policy role_permission_read on public.role_permissions for select to authenticated using(true);
create policy seller_read on public.sellers for select to authenticated using(private.scope(organization_id,id));
create policy point_read on public.fulfillment_points for select to authenticated using(private.scope(organization_id,null,null,id));
create policy customer_read on public.customers for select to authenticated using(private.scope(organization_id,seller_id,id));
create policy supplier_read on public.suppliers for select to authenticated using(private.scope(organization_id));
create policy product_read on public.products for select to authenticated using(private.scope(organization_id) or (active and private.can_product(organization_id,id)));
create policy product_supplier_read on public.product_suppliers for select to authenticated using(private.scope(organization_id));
create policy catalog_read on public.catalog_access for select to authenticated using(private.scope(organization_id,seller_id,customer_id));
create policy inventory_read on public.inventory for select to authenticated using(private.scope(organization_id));
create policy order_read on public.orders for select to authenticated using(private.scope(organization_id,seller_id,customer_id,fulfillment_point_id));
create policy line_read on public.order_lines for select to authenticated using(private.can_order(organization_id,order_id));
create policy event_read on public.order_events for select to authenticated using(private.can_order(organization_id,order_id));
create policy commission_read on public.commissions for select to authenticated using(private.scope(organization_id,seller_id));
create policy followup_read on public.followups for select to authenticated using(private.scope(organization_id,seller_id));
create policy receivable_read on public.receivables for select to authenticated using(private.scope(organization_id,null,customer_id));
create policy retail_read on public.retail_inventory for select to authenticated using(private.scope(organization_id,null,customer_id));
create policy local_sale_read on public.local_sales for select to authenticated using(private.scope(organization_id,null,customer_id));
create policy fulfillment_read on public.fulfillment_records for select to authenticated using(private.can_order(organization_id,order_id) and private.scope(organization_id,null,null,fulfillment_point_id));
create policy request_read on public.access_requests for select to authenticated using(user_id=auth.uid() or private.is_admin());
create policy audit_read on public.audit_events for select to authenticated using(private.is_admin());

-- Safe edits only; ownership, assignments and membership are never client-writable.
grant update(title,category,price,active) on public.products to authenticated;
create policy product_edit on public.products for update to authenticated using(private.scope(organization_id)) with check(private.scope(organization_id));
grant update(quantity) on public.inventory to authenticated;
create policy inventory_edit on public.inventory for update to authenticated using(private.scope(organization_id)) with check(private.scope(organization_id));
grant update(quantity,price,published) on public.retail_inventory to authenticated;
create policy retail_edit on public.retail_inventory for update to authenticated using(private.scope(organization_id,null,customer_id)) with check(private.scope(organization_id,null,customer_id));
grant insert(organization_id,customer_id,seller_id,note,next_date) on public.followups to authenticated;
create policy followup_create on public.followups for insert to authenticated with check(
 private.scope(organization_id,seller_id) and exists(select 1 from public.customers c where c.organization_id=followups.organization_id and c.id=followups.customer_id and c.seller_id=followups.seller_id));

create index memberships_user on public.memberships(user_id,organization_id);
create index orders_scope on public.orders(organization_id,seller_id,customer_id,fulfillment_point_id);
create index customers_scope on public.customers(organization_id,seller_id);
create index catalog_scope on public.catalog_access(organization_id,seller_id,customer_id,product_id);
create index lines_order on public.order_lines(organization_id,order_id);
commit;
