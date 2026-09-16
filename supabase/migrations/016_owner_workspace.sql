begin;
-- Prospection belongs to Surtiva. No distributor gets access to the owner's CRM.
create table public.commercial_agents (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 150),
 kind text not null check(kind in ('human','digital')), instructions text not null default '',
 execution_mode text not null default 'manual' check(execution_mode='manual'), created_at timestamptz not null default now()
);
create table public.prospects (
 id uuid primary key default gen_random_uuid(), name text not null check(length(name) between 1 and 150),
 city text not null default '', contact text not null default '',
 channel text not null check(channel in ('visita','telefono','whatsapp','referido','web','otro')),
 status text not null default 'nuevo' check(status in ('nuevo','contactado','visita','propuesta','ganado','descartado')),
 notes text not null default '', next_date date, agent_id uuid references public.commercial_agents,
 estimated_value numeric(14,2) not null default 0 check(estimated_value>=0), created_at timestamptz not null default now()
);
alter table public.commercial_agents enable row level security;
alter table public.prospects enable row level security;
create policy owner_agents on public.commercial_agents for all to authenticated using(private.is_admin()) with check(private.is_admin());
create policy owner_prospects on public.prospects for all to authenticated using(private.is_admin()) with check(private.is_admin());
revoke all on public.commercial_agents,public.prospects from anon;
grant select,insert,update on public.commercial_agents,public.prospects to authenticated;

-- Read-only inspection by the owner using the actual member's RLS context.
-- SECURITY INVOKER is intentional: table-owner privileges would bypass RLS.
create function public.review_workspace(membership_key uuid, resource text, page_offset integer default 0, required_permission text default null, order_filter uuid default null)
returns jsonb language plpgsql volatile security invoker set search_path='' as $$
declare m public.memberships; result jsonb; old_sub text; old_claims text; begin
 if not private.is_admin() then raise exception 'Solo el administrador maestro puede revisar perfiles' using errcode='42501'; end if;
 select * into m from public.memberships where id=membership_key and status='active' and role_id<>'surtiva_admin';
 if m.id is null or not exists(select 1 from public.organizations where id=m.organization_id and status='active') then raise exception 'El perfil no tiene acceso activo' using errcode='42501'; end if;
 if required_permission is null or not exists(select 1 from public.role_permissions where role_id=m.role_id and permission_id=required_permission) then return '[]'::jsonb; end if;
 old_sub:=current_setting('request.jwt.claim.sub',true); old_claims:=current_setting('request.jwt.claims',true);
 perform set_config('request.jwt.claim.sub',m.user_id::text,true);
 perform set_config('request.jwt.claims',jsonb_build_object('sub',m.user_id,'role','authenticated')::text,true);
 result:=public.workspace_data(m.organization_id,resource,page_offset,order_filter);
 perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
 perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 return result;
exception when others then
 if old_sub is not null or old_claims is not null then
  perform set_config('request.jwt.claim.sub',coalesce(old_sub,''),true);
  perform set_config('request.jwt.claims',coalesce(old_claims,''),true);
 end if;
 raise;
end $$;
revoke all on function public.review_workspace(uuid,text,integer,text,uuid) from public,anon;
grant execute on function public.review_workspace(uuid,text,integer,text,uuid) to authenticated;
commit;
