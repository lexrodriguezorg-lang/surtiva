begin;

alter table public.inventory add column revision integer not null default 1;
alter table public.inventory add column updated_at timestamptz;

create table public.inventory_movements (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null, product_id uuid not null,
 before_quantity integer, after_quantity integer,
 before_reserved integer not null, after_reserved integer not null,
 revision integer not null, actor_id uuid references public.profiles(id),
 origin text not null, created_at timestamptz not null default now(),
 foreign key(organization_id,product_id) references public.inventory(organization_id,product_id)
);
create index inventory_movements_recent on public.inventory_movements(organization_id,created_at desc);
create table public.inventory_commands (
 organization_id uuid not null, request_key uuid not null, actor_id uuid not null references public.profiles(id),
 product_id uuid not null, operation text not null, amount integer not null, expected_revision integer not null,
 result jsonb not null, created_at timestamptz not null default now(),
 primary key(organization_id,request_key),
 foreign key(organization_id,product_id) references public.inventory(organization_id,product_id)
);
alter table public.inventory_movements enable row level security;
alter table public.inventory_commands enable row level security;
create policy inventory_movements_manager on public.inventory_movements for select to authenticated
 using(private.is_admin() or private.member_role(organization_id)='distributor_admin');
create policy inventory_commands_manager on public.inventory_commands for select to authenticated
 using(private.is_admin() or private.member_role(organization_id)='distributor_admin');
revoke all on public.inventory_movements,public.inventory_commands from anon,authenticated;
grant select on public.inventory_movements,public.inventory_commands to authenticated;

-- Capture reservations, dispatches and corrections without an invented backfill.
create function private.inventory_version() returns trigger language plpgsql set search_path='' as $$
begin
 if row(new.quantity,new.reserved,new.origin) is distinct from row(old.quantity,old.reserved,old.origin) then
  new.revision:=old.revision+1;new.updated_at:=now();
 else new.revision:=old.revision;new.updated_at:=old.updated_at;end if;
 return new;
end $$;
create trigger inventory_version before update on public.inventory for each row execute function private.inventory_version();
create function private.inventory_movement() returns trigger language plpgsql security definer set search_path='' as $$
begin
 if new.revision<>old.revision then
  insert into public.inventory_movements(organization_id,product_id,before_quantity,after_quantity,before_reserved,after_reserved,revision,actor_id,origin)
  values(new.organization_id,new.product_id,old.quantity,new.quantity,old.reserved,new.reserved,new.revision,auth.uid(),new.origin);
 end if;
 return new;
end $$;
create trigger inventory_movement after update on public.inventory for each row execute function private.inventory_movement();

create function public.adjust_inventory(org uuid,product_key uuid,operation text,amount integer,expected_revision integer,request_key uuid) returns jsonb
language plpgsql security definer set search_path='' as $$
declare inv public.inventory; prior public.inventory_commands; target bigint; result jsonb;
begin
 if auth.uid() is null or not coalesce(private.is_admin() or private.member_role(org)='distributor_admin',false) then raise exception 'No autorizado' using errcode='42501';end if;
 if not exists(select 1 from public.organizations where id=org and status='active' and kind='distribuidor') then raise exception 'Organización no disponible' using errcode='42501';end if;
 if request_key is null or operation is null or operation not in ('set','delta') or amount is null or expected_revision is null or expected_revision<1 or abs(amount::bigint)>99999999 then raise exception 'Ajuste inválido';end if;
 perform pg_advisory_xact_lock(hashtextextended(org::text||request_key::text,0));
 select * into prior from public.inventory_commands c where c.organization_id=org and c.request_key=adjust_inventory.request_key;
 if found then
  if row(prior.actor_id,prior.product_id,prior.operation,prior.amount,prior.expected_revision) is distinct from row(auth.uid(),product_key,operation,amount,expected_revision) then raise exception 'La solicitud ya se usó para otro ajuste';end if;
  return prior.result;
 end if;
 insert into public.inventory(organization_id,product_id) select org,p.id from public.products p where p.organization_id=org and p.id=product_key on conflict do nothing;
 select * into inv from public.inventory where organization_id=org and product_id=product_key for update;
 if not found then raise exception 'Referencia no encontrada';end if;
 if inv.revision<>expected_revision then raise exception 'Las existencias cambiaron. Actualiza antes de ajustar.' using errcode='40001';end if;
 if operation='delta' and inv.quantity is null then raise exception 'Confirma las existencias físicas antes de sumar o restar.';end if;
 target:=case when operation='set' then amount else inv.quantity::bigint+amount end;
 if target<inv.reserved or target<0 or target>99999999 then raise exception 'El ajuste no puede reducir las existencias por debajo de lo comprometido.';end if;
 update public.inventory set quantity=target,origin='ajuste_distribuidor' where organization_id=org and product_id=product_key returning * into inv;
 result:=to_jsonb(inv);
 insert into public.inventory_commands(organization_id,request_key,actor_id,product_id,operation,amount,expected_revision,result)
 values(org,request_key,auth.uid(),product_key,operation,amount,expected_revision,result);
 return result;
end $$;

create function public.supplier_workspace(org uuid,search_text text default '',stock_filter text default 'all',page_offset integer default 0) returns jsonb
language plpgsql stable security definer set search_path='' as $$
declare result jsonb;
begin
 if auth.uid() is null or not coalesce(private.is_admin() or private.member_role(org)='distributor_admin',false) then raise exception 'No autorizado' using errcode='42501';end if;
 if not exists(select 1 from public.organizations where id=org and kind='distribuidor' and status='active') then raise exception 'Organización no disponible' using errcode='42501';end if;
 if stock_filter is null or stock_filter not in ('all','unknown','available','out') or page_offset is null or page_offset<0 or page_offset>100000 or length(coalesce(search_text,''))>120 then raise exception 'Consulta inválida';end if;
 with inventory as (
  select p.id product_id,p.organization_id,p.sku,p.title,p.image,p.category,p.active,
   i.quantity,coalesce(i.reserved,0) reserved,coalesce(i.revision,1) revision,i.updated_at,
   case when i.quantity is null then null else i.quantity-i.reserved end available
  from public.products p left join public.inventory i on i.product_id=p.id and i.organization_id=p.organization_id where p.organization_id=org
 ), filtered as (
  select * from inventory where (coalesce(search_text,'')='' or strpos(lower(title||' '||sku),lower(trim(search_text)))>0)
   and (stock_filter='all' or (stock_filter='unknown' and quantity is null) or (stock_filter='available' and available>0) or (stock_filter='out' and available=0))
 ), page as (select * from filtered order by title,sku,product_id offset page_offset limit 24)
 select jsonb_build_object(
  'products',coalesce((select jsonb_agg(to_jsonb(p) order by title,sku,product_id) from page p),'[]'),
  'total',(select count(*) from filtered),'offset',page_offset,
  'summary',(select jsonb_build_object('products',count(*),'unknown',count(*) filter(where quantity is null),'available',count(*) filter(where available>0),'out',count(*) filter(where available=0),'reserved',coalesce(sum(reserved),0),'updatedAt',max(updated_at)) from inventory),
  'orders',coalesce((select jsonb_agg(to_jsonb(o) order by o.created_at) from (
    select id,number,status,approval_status,availability_status,created_at,revision from public.orders
    where organization_id=org and status in ('aprobacion','recibido','preparando','despachado') order by created_at limit 8
  ) o),'[]'),
  'orderSummary',(select jsonb_build_object('availability',count(*) filter(where status in ('aprobacion','recibido') and availability_status in ('requested','partial')),'preparing',count(*) filter(where status='preparando'),'shipped',count(*) filter(where status='despachado')) from public.orders where organization_id=org),
  'movements',coalesce((select jsonb_agg(to_jsonb(m) order by m.created_at desc,m.id) from (
   select m.id,m.product_id,p.title,p.sku,m.before_quantity,m.after_quantity,m.before_reserved,m.after_reserved,m.created_at,
    coalesce(pr.name,'Sistema') actor from public.inventory_movements m join public.products p on p.id=m.product_id left join public.profiles pr on pr.id=m.actor_id
    where m.organization_id=org order by m.created_at desc,m.id limit 6
  ) m),'[]')
 ) into result;
 return result;
end $$;
revoke all on function public.adjust_inventory(uuid,uuid,text,integer,integer,uuid),public.supplier_workspace(uuid,text,text,integer) from public,anon;
grant execute on function public.adjust_inventory(uuid,uuid,text,integer,integer,uuid),public.supplier_workspace(uuid,text,text,integer) to authenticated;
revoke all on function private.inventory_version(),private.inventory_movement() from public,anon,authenticated;
commit;
