-- Run once in the Supabase SQL Editor before using receive_stock.ts.
-- Each delivery is added atomically using the ingredient's configured pack size
-- and recorded in stock_receipts for an audit trail.

create table if not exists public.stock_receipts (
    id uuid primary key default gen_random_uuid(),
    ingredient_id integer not null
        references public.ingredients(id) on delete restrict,
    gfs_code text not null,
    pack_count numeric not null check (pack_count > 0),
    pack_size_oz numeric not null check (pack_size_oz > 0),
    stock_added_oz numeric not null check (stock_added_oz > 0),
    stock_after_oz numeric not null,
    received_by text,
    received_at timestamp with time zone not null default now()
);

alter table public.stock_receipts enable row level security;

create or replace function public.receive_stock_delivery(
    p_gfs_code text,
    p_pack_count numeric,
    p_received_by text default null
)
returns jsonb
language plpgsql
security invoker
set search_path = public
as $$
declare
    v_ingredient public.ingredients%rowtype;
    v_rows integer;
    v_stock_added_oz numeric;
begin
    if p_gfs_code is null or btrim(p_gfs_code) = '' then
        raise exception 'GFS code is required';
    end if;

    if p_pack_count is null or p_pack_count <= 0 then
        raise exception 'Pack count must be positive';
    end if;

    update public.ingredients
    set current_stock_oz =
        current_stock_oz + (pack_size_oz * p_pack_count)
    where gfs_code = btrim(p_gfs_code)
      and pack_size_oz is not null
      and pack_size_oz > 0
    returning * into v_ingredient;

    get diagnostics v_rows = row_count;

    if v_rows = 0 then
        raise exception
            'No ingredient with GFS code % has a positive pack_size_oz',
            p_gfs_code;
    end if;

    if v_rows > 1 then
        raise exception 'GFS code % matches more than one ingredient', p_gfs_code;
    end if;

    v_stock_added_oz := v_ingredient.pack_size_oz * p_pack_count;

    insert into public.stock_receipts (
        ingredient_id,
        gfs_code,
        pack_count,
        pack_size_oz,
        stock_added_oz,
        stock_after_oz,
        received_by
    )
    values (
        v_ingredient.id,
        btrim(p_gfs_code),
        p_pack_count,
        v_ingredient.pack_size_oz,
        v_stock_added_oz,
        v_ingredient.current_stock_oz,
        nullif(btrim(p_received_by), '')
    );

    return jsonb_build_object(
        'ingredient_id', v_ingredient.id,
        'ingredient_name', v_ingredient.name,
        'pack_count', p_pack_count,
        'pack_size_oz', v_ingredient.pack_size_oz,
        'stock_added_oz', v_stock_added_oz,
        'stock_after_oz', v_ingredient.current_stock_oz
    );
end;
$$;

revoke all on table public.stock_receipts
from public, anon, authenticated;

revoke all on function public.receive_stock_delivery(text, numeric, text)
from public, anon, authenticated;

grant all on table public.stock_receipts to service_role;

grant execute on function public.receive_stock_delivery(text, numeric, text)
to service_role;
