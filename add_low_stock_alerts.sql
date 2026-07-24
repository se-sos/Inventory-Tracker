-- Run once in the Supabase SQL Editor before send_low_stock_alerts.ts.
-- Configure low_stock_threshold_oz on each ingredient that should be monitored.

alter table public.ingredients
add column if not exists low_stock_threshold_oz numeric
    check (low_stock_threshold_oz is null or low_stock_threshold_oz >= 0);

alter table public.ingredients
add column if not exists low_stock_alert_active boolean not null default false;

alter table public.ingredients
add column if not exists last_low_stock_alert_at timestamp with time zone;

create table if not exists public.low_stock_alerts (
    id uuid primary key default gen_random_uuid(),
    ingredient_id integer not null
        references public.ingredients(id) on delete restrict,
    stock_oz numeric not null,
    threshold_oz numeric not null,
    status text not null default 'pending'
        check (status in ('pending', 'sent', 'failed')),
    error_message text,
    created_at timestamp with time zone not null default now(),
    sent_at timestamp with time zone
);

alter table public.low_stock_alerts enable row level security;

create or replace function public.claim_low_stock_alerts()
returns table (
    alert_id uuid,
    ingredient_name text,
    current_stock_oz numeric,
    threshold_oz numeric
)
language plpgsql
security invoker
set search_path = public
as $$
begin
    -- A restock rearms the alert for the next time this item runs low.
    update public.ingredients
    set low_stock_alert_active = false
    where low_stock_alert_active = true
      and (
        low_stock_threshold_oz is null
        or current_stock_oz > low_stock_threshold_oz
      );

    return query
    with candidates as (
        select
            ingredient.id,
            ingredient.name,
            ingredient.current_stock_oz,
            ingredient.low_stock_threshold_oz
        from public.ingredients as ingredient
        where ingredient.low_stock_threshold_oz is not null
          and ingredient.current_stock_oz
              <= ingredient.low_stock_threshold_oz
          and ingredient.low_stock_alert_active = false
        for update skip locked
    ),
    inserted as (
        insert into public.low_stock_alerts (
            ingredient_id,
            stock_oz,
            threshold_oz
        )
        select
            candidate.id,
            candidate.current_stock_oz,
            candidate.low_stock_threshold_oz
        from candidates as candidate
        returning
            id,
            ingredient_id,
            stock_oz,
            threshold_oz
    ),
    activated as (
        update public.ingredients as ingredient
        set
            low_stock_alert_active = true,
            last_low_stock_alert_at = now()
        from inserted as alert
        where ingredient.id = alert.ingredient_id
        returning ingredient.id
    )
    select
        alert.id,
        candidate.name,
        alert.stock_oz,
        alert.threshold_oz
    from inserted as alert
    join candidates as candidate
      on candidate.id = alert.ingredient_id;
end;
$$;

create or replace function public.complete_low_stock_alerts(
    p_alert_ids uuid[],
    p_status text,
    p_error_message text default null
)
returns integer
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_updated integer;
begin
    if p_status not in ('sent', 'failed') then
        raise exception 'Alert status must be sent or failed';
    end if;

    update public.low_stock_alerts
    set
        status = p_status,
        error_message = case
            when p_status = 'failed' then p_error_message
            else null
        end,
        sent_at = case
            when p_status = 'sent' then now()
            else null
        end
    where id = any(p_alert_ids)
      and status = 'pending';

    get diagnostics v_updated = row_count;

    -- Failed deliveries may be claimed again on the next scheduled run.
    if p_status = 'failed' then
        update public.ingredients as ingredient
        set low_stock_alert_active = false
        where ingredient.id in (
            select alert.ingredient_id
            from public.low_stock_alerts as alert
            where alert.id = any(p_alert_ids)
        );
    end if;

    return v_updated;
end;
$$;

revoke all on table public.low_stock_alerts
from public, anon, authenticated;

revoke all on function public.claim_low_stock_alerts()
from public, anon, authenticated;

revoke all on function public.complete_low_stock_alerts(uuid[], text, text)
from public, anon, authenticated;

grant all on table public.low_stock_alerts to service_role;
grant execute on function public.claim_low_stock_alerts() to service_role;
grant execute on function public.complete_low_stock_alerts(uuid[], text, text)
to service_role;
