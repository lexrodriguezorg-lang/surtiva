begin;
create table private.invitation_delivery (
 invitation_id uuid primary key references public.invitations(id) on delete cascade,
 new_user_id uuid references auth.users(id),claimed_at timestamptz,
 delivery_status text not null default 'not_sent' check(delivery_status in ('not_sent','accepted','failed'))
);
alter table private.invitation_delivery enable row level security;
revoke all on private.invitation_delivery from public,anon,authenticated;

create function private.live_invitation(secret text) returns public.invitations language plpgsql stable security definer set search_path='' as $$
declare i public.invitations; begin
 if length(secret)<>72 then raise exception 'Invitación no disponible' using errcode='42501'; end if;
 select * into i from public.invitations where token_hash=encode(sha256(convert_to(secret,'UTF8')),'hex') and status='pending' and expires_at>now();
 if i.id is null or not exists(select 1 from public.organizations where id=i.organization_id and status='active')
 or not exists(select 1 from public.memberships m join public.organizations o on o.id=m.organization_id where m.user_id=i.created_by and m.status='active' and o.status='active' and ((m.organization_id=i.organization_id and m.role_id='distributor_admin') or (o.kind='plataforma' and m.role_id='surtiva_admin'))) then
  raise exception 'Invitación no disponible' using errcode='42501';
 end if;
 return i;
end $$;
revoke all on function private.live_invitation(text) from public,anon,authenticated;

create function public.invitation_details(secret text) returns jsonb language plpgsql stable security definer set search_path='' as $$
declare i public.invitations; ready boolean; begin
 i:=private.live_invitation(secret);
 select exists(select 1 from private.invitation_delivery d join auth.users u on u.id=d.new_user_id
  where d.invitation_id=i.id and d.claimed_at is null and u.email_confirmed_at is null
  and not exists(select 1 from public.memberships m where m.user_id=u.id)) into ready;
 return jsonb_build_object('name',i.name,'email',i.email,'role',i.role_id,'organization',(select name from public.organizations where id=i.organization_id),'requiresSignIn',not ready);
end $$;
revoke all on function public.invitation_details(text) from public;
grant execute on function public.invitation_details(text) to anon,authenticated;

-- Only the Edge Function's server credential can bind a newly created identity
-- or exchange this one-use invitation. Existing accounts cannot be impersonated.
create function public.service_invitation(operation text,secret text,payload jsonb default '{}') returns jsonb language plpgsql security definer set search_path='' as $$
declare i public.invitations; d private.invitation_delivery; u auth.users; begin
 i:=private.live_invitation(secret);
 perform pg_advisory_xact_lock(hashtextextended(i.id::text,21));
 if operation='bind' then
  select * into u from auth.users where id=(payload->>'userId')::uuid;
  if u.id is null or lower(u.email)<>i.email or u.email_confirmed_at is not null
   or u.raw_user_meta_data->>'invitation_token' is distinct from secret
   or u.created_at<i.created_at or i.accepted_by is distinct from u.id
   or exists(select 1 from public.memberships where user_id=u.id) then raise exception 'Identidad no vinculable' using errcode='42501'; end if;
  insert into private.invitation_delivery(invitation_id,new_user_id) values(i.id,u.id);
  return jsonb_build_object('ok',true);
 elsif operation='delivery' then
  insert into private.invitation_delivery(invitation_id,delivery_status) values(i.id,payload->>'status') on conflict(invitation_id) do update set delivery_status=excluded.delivery_status;
  return jsonb_build_object('ok',true);
 elsif operation='claim' then
  select * into d from private.invitation_delivery where invitation_id=i.id for update;
  select * into u from auth.users where id=d.new_user_id;
  if d.new_user_id is null or d.claimed_at is not null or u.email_confirmed_at is not null
   or lower(u.email)<>i.email or exists(select 1 from public.memberships where user_id=u.id) then
   raise exception 'Ingresa con tu cuenta para aceptar' using errcode='42501';
  end if;
  update private.invitation_delivery set claimed_at=now() where invitation_id=i.id;
  return jsonb_build_object('userId',u.id,'email',i.email);
 elsif operation='release' then
  update private.invitation_delivery set claimed_at=null where invitation_id=i.id and new_user_id=(payload->>'userId')::uuid
   and exists(select 1 from auth.users where id=new_user_id and email_confirmed_at is null);
  return jsonb_build_object('ok',true);
 end if;
 raise exception 'Operación inválida';
end $$;
revoke all on function public.service_invitation(text,text,jsonb) from public,anon,authenticated;
grant execute on function public.service_invitation(text,text,jsonb) to service_role;

create function public.complete_invitation(secret text,details jsonb) returns uuid language plpgsql security definer set search_path='' as $$
declare i public.invitations; request_id uuid; full_name text:=trim(details->>'name'); business text:=trim(details->>'business'); begin
 i:=private.live_invitation(secret);
 if length(coalesce(full_name,'')) not between 1 and 100 then raise exception 'Revisa tu nombre'; end if;
 request_id:=public.accept_invitation(secret);
 update public.profiles set name=full_name where id=auth.uid();
 if i.role_id='merchant' then
  if length(coalesce(business,'')) not between 1 and 120 then raise exception 'Revisa el nombre de tu negocio'; end if;
  update public.access_requests set organization_name=business where id=request_id;
 end if;
 return request_id;
end $$;
revoke all on function public.complete_invitation(text,jsonb) from public,anon;
grant execute on function public.complete_invitation(text,jsonb) to authenticated;
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
  select p.id,p.organization_id,o.name supplier_name,p.sku,p.title,p.category,p.price,p.image,p.active,p.pack_size,p.dimensions
  from public.products p join public.organizations o on o.id=p.organization_id
  where p.active and o.status='active' and not o.is_test and (approved or p.organization_id=invited_org) and (
   exists(select 1 from public.catalog_publications c where c.organization_id=p.organization_id and c.product_id=p.id)
   or (coalesce(options->>'published','false')<>'true' and private.can_product(p.organization_id,p.id)))
 ), filtered as materialized (
  select *,row_number() over(partition by category order by md5(sku),id) discovery_rank from visible
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
  select category name,count(*) count,(array_agg(image order by md5(sku),id) filter(where image is not null and image<>''))[1] image
  from visible group by category
 ), suppliers as (select distinct organization_id id,supplier_name name from visible)
 select jsonb_build_object(
  'products',coalesce((select jsonb_agg(to_jsonb(p)-'discovery_rank') from page p),'[]'),
  'categories',coalesce((select jsonb_agg(to_jsonb(c) order by name) from categories c),'[]'),
  'suppliers',coalesce((select jsonb_agg(to_jsonb(s) order by name) from suppliers s),'[]'),
  'total',(select count(*) from filtered),'catalogTotal',(select count(*) from visible),
  'hasMore',(select count(*) from filtered)>skip+take) into result;
 return result;
end $$;

commit;
