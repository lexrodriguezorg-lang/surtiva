begin;
-- Publication is explicit. Operational data stays under the existing tenant RLS.
create table public.catalog_publications (
 organization_id uuid not null, product_id uuid primary key, published_at timestamptz not null default now(),
 foreign key(organization_id,product_id) references public.products(organization_id,id) on delete cascade
);
alter table public.catalog_publications enable row level security;
revoke all on public.catalog_publications from anon,authenticated;
grant select,insert,delete on public.catalog_publications to authenticated;
create policy manage_publications on public.catalog_publications for all to authenticated using(private.is_admin()) with check(private.is_admin());

create function public.commercial_catalog(page_offset integer default 0, published_only boolean default false)
returns jsonb language plpgsql stable security definer set search_path='' as $$
declare result jsonb; begin
 if not exists(select 1 from public.memberships m join public.organizations o on o.id=m.organization_id
  where m.user_id=auth.uid() and m.status='active' and o.status='active') then
  raise exception 'Se requiere acceso aprobado' using errcode='42501';
 end if;
 if page_offset is null or page_offset<0 or page_offset>100000 then raise exception 'Página inválida'; end if;
 select coalesce(jsonb_agg(to_jsonb(q)),'[]'::jsonb) into result from (
  select p.id,p.organization_id,o.name as supplier_name,p.sku,p.title,p.category,p.price,p.image,p.active,p.pack_size,p.dimensions
  from public.products p join public.organizations o on o.id=p.organization_id
  where p.active and o.status='active' and not o.is_test and (
   exists(select 1 from public.catalog_publications c where c.organization_id=p.organization_id and c.product_id=p.id)
   or (not published_only and private.can_product(p.organization_id,p.id)))
  order by p.sku,p.id limit 500 offset page_offset
 ) q;
 return result;
end $$;
revoke all on function public.commercial_catalog(integer,boolean) from public,anon;
grant execute on function public.commercial_catalog(integer,boolean) to authenticated;

-- Published products can be ordered by a seller of that distributor, or an
-- active merchant linked to it. Publication never assigns clients or orders.
create or replace function private.can_product(org uuid, product uuid) returns boolean language sql stable security definer set search_path='' as $$
 select private.scope(org) or exists(select 1 from public.catalog_access a where a.organization_id=org and a.product_id=product and private.scope(org,a.seller_id,a.customer_id))
 or (exists(select 1 from public.catalog_publications p where p.organization_id=org and p.product_id=product)
 and (private.member_role(org)='seller' or exists(select 1 from public.clients c where c.organization_id=org and private.is_merchant(org,c.id))));
$$;
insert into public.role_permissions(role_id,permission_id) values('fulfillment_partner','catalog.read') on conflict do nothing;
-- The owner asked for the pilot catalogue in every approved commercial profile.
insert into public.catalog_publications(organization_id,product_id)
 select p.organization_id,p.id from public.products p join public.organizations o on o.id=p.organization_id
 where o.slug='dukes' and not o.is_test and p.active on conflict do nothing;
commit;
