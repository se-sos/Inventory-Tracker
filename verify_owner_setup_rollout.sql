-- Safe production smoke test for Owner Setup.
-- All temporary setup rows are wrapped in a transaction that always rolls back.

do $$
declare
    v_signature text;
begin
    foreach v_signature in array array[
        'public.replace_square_catalog_cache(jsonb,text)',
        'public.save_owner_ingredient(integer,text,numeric,numeric,numeric,text,numeric,text,text)',
        'public.archive_owner_ingredient(integer,text)',
        'public.save_owner_menu_item(integer,text,text,jsonb,text)',
        'public.archive_owner_menu_item(integer,text)'
    ]
    loop
        if has_function_privilege('anon', v_signature, 'execute') then
            raise exception 'anon can execute %', v_signature;
        end if;

        if has_function_privilege(
            'authenticated',
            v_signature,
            'execute'
        ) then
            raise exception 'authenticated can execute %', v_signature;
        end if;

        if not has_function_privilege(
            'service_role',
            v_signature,
            'execute'
        ) then
            raise exception 'service_role cannot execute %', v_signature;
        end if;
    end loop;

    if has_table_privilege(
        'anon',
        'public.inventory_setup_activity',
        'select'
    ) or has_table_privilege(
        'authenticated',
        'public.inventory_setup_activity',
        'select'
    ) then
        raise exception 'setup audit table is readable by a public role';
    end if;
end;
$$;

begin;
set local role service_role;

do $$
declare
    v_ingredient_id integer;
    v_menu_item_id integer;
    v_expected_error boolean;
    v_audit_count integer;
    v_test_suffix text := txid_current()::text;
    v_ingredient_name text;
    v_square_id text;
begin
    v_ingredient_name := 'Owner Setup Validation ' || v_test_suffix;
    v_square_id := 'owner-setup-validation-' || v_test_suffix;

    insert into public.square_catalog_variations (
        square_variation_id,
        item_name,
        variation_name,
        display_name,
        sku,
        is_available,
        refreshed_at
    )
    values (
        v_square_id,
        'Owner Setup Validation',
        'Temporary',
        'Owner Setup Validation - Temporary',
        null,
        true,
        now()
    );

    v_expected_error := false;
    begin
        perform public.save_owner_ingredient(
            null,
            v_ingredient_name || ' Invalid',
            0,
            11,
            10,
            null,
            null,
            null,
            'rollout-validation'
        );
    exception
        when others then
            v_expected_error := true;
    end;

    if not v_expected_error then
        raise exception 'invalid ingredient stock range was accepted';
    end if;

    v_ingredient_id := public.save_owner_ingredient(
        null,
        v_ingredient_name,
        0,
        1,
        10,
        'VALIDATION-' || v_test_suffix,
        5,
        null,
        'rollout-validation'
    );

    v_expected_error := false;
    begin
        perform public.save_owner_ingredient(
            null,
            v_ingredient_name,
            0,
            1,
            10,
            null,
            null,
            null,
            'rollout-validation'
        );
    exception
        when others then
            v_expected_error := true;
    end;

    if not v_expected_error then
        raise exception 'duplicate active ingredient name was accepted';
    end if;

    v_expected_error := false;
    begin
        perform public.save_owner_menu_item(
            null,
            'Owner Setup Invalid Recipe ' || v_test_suffix,
            v_square_id,
            jsonb_build_array(
                jsonb_build_object(
                    'ingredient_id',
                    v_ingredient_id,
                    'quantity_required_oz',
                    0
                )
            ),
            'rollout-validation'
        );
    exception
        when others then
            v_expected_error := true;
    end;

    if not v_expected_error then
        raise exception 'zero-ounce recipe amount was accepted';
    end if;

    v_expected_error := false;
    begin
        perform public.save_owner_menu_item(
            null,
            'Owner Setup Duplicate Recipe ' || v_test_suffix,
            v_square_id,
            jsonb_build_array(
                jsonb_build_object(
                    'ingredient_id',
                    v_ingredient_id,
                    'quantity_required_oz',
                    1
                ),
                jsonb_build_object(
                    'ingredient_id',
                    v_ingredient_id,
                    'quantity_required_oz',
                    1
                )
            ),
            'rollout-validation'
        );
    exception
        when others then
            v_expected_error := true;
    end;

    if not v_expected_error then
        raise exception 'duplicate recipe ingredient was accepted';
    end if;

    v_menu_item_id := public.save_owner_menu_item(
        null,
        'Owner Setup Validation Item ' || v_test_suffix,
        v_square_id,
        jsonb_build_array(
            jsonb_build_object(
                'ingredient_id',
                v_ingredient_id,
                'quantity_required_oz',
                1.25
            )
        ),
        'rollout-validation'
    );

    v_expected_error := false;
    begin
        perform public.save_owner_menu_item(
            null,
            'Owner Setup Duplicate Mapping ' || v_test_suffix,
            v_square_id,
            jsonb_build_array(
                jsonb_build_object(
                    'ingredient_id',
                    v_ingredient_id,
                    'quantity_required_oz',
                    1
                )
            ),
            'rollout-validation'
        );
    exception
        when others then
            v_expected_error := true;
    end;

    if not v_expected_error then
        raise exception 'duplicate Square mapping was accepted';
    end if;

    v_expected_error := false;
    begin
        perform public.archive_owner_ingredient(
            v_ingredient_id,
            'rollout-validation'
        );
    exception
        when others then
            v_expected_error := true;
    end;

    if not v_expected_error then
        raise exception 'ingredient used by an active menu item was archived';
    end if;

    perform public.archive_owner_menu_item(
        v_menu_item_id,
        'rollout-validation'
    );
    perform public.archive_owner_ingredient(
        v_ingredient_id,
        'rollout-validation'
    );

    if exists (
        select 1
        from public.menu_items
        where id = v_menu_item_id
          and is_active
    ) or exists (
        select 1
        from public.ingredients
        where id = v_ingredient_id
          and is_active
    ) then
        raise exception 'archive flag was not applied';
    end if;

    select count(*)
    into v_audit_count
    from public.inventory_setup_activity
    where changed_by = 'rollout-validation'
      and entity_id in (
          v_ingredient_id::text,
          v_menu_item_id::text
      );

    if v_audit_count <> 4 then
        raise exception
            'expected four setup audit records, found %',
            v_audit_count;
    end if;
end;
$$;

rollback;

select
    'owner_setup_rollout_validation_passed' as status,
    (select count(*) from public.ingredients) as ingredients,
    (select count(*) from public.menu_items) as menu_items,
    (select count(*) from public.recipe_ingredients) as recipe_lines,
    (select count(*) from public.inventory_setup_activity) as audit_rows,
    (select count(*) from public.square_catalog_variations)
        as cached_square_variations;
