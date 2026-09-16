begin;
delete from public.role_permissions where role_id='distributor_admin' and permission_id='retail.manage';
-- Trading account labels identify the distributor without exposing its tenant.
alter table public.clients add column distributor_name text;
update public.clients c set distributor_name=o.name from public.organizations o where o.id=c.organization_id;
create function private.label_trading_account() returns trigger language plpgsql security definer set search_path='' as $$
begin select name into new.distributor_name from public.organizations where id=new.organization_id; return new; end $$;
create trigger trading_account_label before insert or update of organization_id on public.clients for each row execute function private.label_trading_account();
revoke all on function private.label_trading_account() from public,anon,authenticated;
commit;
