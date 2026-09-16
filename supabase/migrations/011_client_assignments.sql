begin;
create function public.assign_client_seller(org uuid, client_key uuid, seller_key uuid default null) returns void
language plpgsql security definer set search_path='' as $$
begin
 if not private.scope(org) then raise exception 'No autorizado' using errcode='42501'; end if;
 if seller_key is not null and not exists(select 1 from public.sellers where id=seller_key and organization_id=org) then raise exception 'Vendedor no autorizado'; end if;
 update public.clients set seller_id=seller_key where id=client_key and organization_id=org;
 if not found then raise exception 'Comercio no encontrado'; end if;
 insert into public.audit_events(organization_id,actor_id,action,target_id) values(org,auth.uid(),'client.assign_seller',client_key);
end $$;
revoke all on function public.assign_client_seller(uuid,uuid,uuid) from public,anon;
grant execute on function public.assign_client_seller(uuid,uuid,uuid) to authenticated;
commit;
