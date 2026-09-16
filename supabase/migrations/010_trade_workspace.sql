begin;
create function public.resolve_trade_organization(workspace uuid, client_key uuid default null, order_key uuid default null) returns uuid
language plpgsql stable security invoker set search_path='' as $$
declare trade uuid; merchant uuid; partner uuid; begin
 if not private.is_admin() and private.member_role(workspace) is null then raise exception 'No autorizado' using errcode='42501'; end if;
 if order_key is not null then
  select o.organization_id,c.merchant_organization_id,n.organization_id into trade,merchant,partner
  from public.orders o left join public.clients c on c.id=o.customer_id left join public.fulfillment_nodes n on n.id=o.fulfillment_point_id where o.id=order_key;
 elsif client_key is not null then
  select c.organization_id,c.merchant_organization_id into trade,merchant from public.clients c where c.id=client_key and c.status='active';
 end if;
 if trade is null or not coalesce(workspace in (trade,merchant,partner),false) then raise exception 'Operación fuera de esta organización' using errcode='42501'; end if;
 return trade;
end $$;
revoke all on function public.resolve_trade_organization(uuid,uuid,uuid) from public,anon;
grant execute on function public.resolve_trade_organization(uuid,uuid,uuid) to authenticated;
-- An inactive account can see its own organization's status, never its business data.
drop policy organization_read on public.organizations;
create policy organization_read on public.organizations for select to authenticated using(private.is_admin() or exists(select 1 from public.memberships m where m.organization_id=organizations.id and m.user_id=auth.uid()));
commit;
