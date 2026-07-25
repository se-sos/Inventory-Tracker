# Owner Setup rollout

Owner Setup is read-only by default. Development and demo use do not require
changing any existing ingredient, menu item, recipe, or Square data.

## What the feature adds

- Add and edit ingredients in ounces.
- Set current stock, restock threshold, maximum capacity, GFS code, and pack
  size.
- Select an existing Square variation from a read-only catalog refresh.
- Add or edit the ingredients and ounce amount deducted by one menu-item sale.
- Archive records without deleting their history.
- Block duplicate mappings, duplicate recipe ingredients, invalid amounts,
  incomplete recipes, and invalid stock ranges.
- Record setup changes in `inventory_setup_activity`.

Square catalog refresh uses only `GET /v2/catalog/list`. No Owner Setup code
creates, changes, or deletes anything in Square.

## Safe rollout order

1. Keep `DASHBOARD_ALLOW_WRITES=false`.
2. Stop the Raspberry Pi Square sync timer during the migration window.
3. Capture a read-only JSON backup and verify the exact Supabase project:

   ```powershell
   npm run owner-setup:backup -- mbexznuuckcikntwqzuh
   ```

   Store the printed backup path, SHA-256 digest, and counts in the rollout
   record. The backup is ignored by Git and contains production data, so do not
   upload or commit it.

4. In Supabase, confirm the expected starting scope:

   ```sql
   select count(*) as ingredients from public.ingredients;
   select count(*) as menu_items from public.menu_items;
   select count(*) as recipe_lines from public.recipe_ingredients;
   ```

   The current pilot expects 30 ingredients and 12 menu items. Record the
   recipe-line count before continuing.

5. Run `add_owner_setup_controls.sql` in the Supabase SQL Editor.
   The file is one transaction. A failed validation rolls back the complete
   migration instead of leaving half-installed controls.
6. Run the same count query again. Ingredient, menu-item, and recipe-line
   counts must be unchanged.
7. Validate the new database rules:

   ```sql
   select * from public.validate_inventory_setup();
   ```

   Then run `verify_owner_setup_rollout.sql`. It verifies database role
   permissions, validation, duplicate rejection, archive behavior, and audit
   creation inside a transaction that ends with `rollback`, so its temporary
   test rows cannot remain in production.

   Finally, run the read-only live postflight:

   ```powershell
   npm run owner-setup:postflight -- mbexznuuckcikntwqzuh
   ```

   It confirms the live counts, active flags, validation results, empty audit
   trail, uninitialized Square sales checkpoint, zero processed orders, and
   GET-only Square catalog access.

8. Deploy the application while it remains read-only. Sign in and review
   `/setup`.
9. Add `SQUARE_ENVIRONMENT=production` and the server-only
   `SQUARE_ACCESS_TOKEN` to `/etc/ghost-inventory/dashboard.env`.
10. Only after the owner approves the visible data, set
   `DASHBOARD_ALLOW_WRITES=true` and restart the dashboard service.
11. Refresh the Square catalog from Owner Setup, then resolve any warnings.
12. Re-enable the Square sync timer after validation passes.

## Operational rollback

If anything looks wrong:

1. Set `DASHBOARD_ALLOW_WRITES=false`.
2. Restart `ghost-inventory-dashboard.service`.
3. Stop the Square sync timer.
4. Deploy the prior application commit if needed.

Do not drop the additive columns or audit tables during an operational
rollback. Leaving them in place preserves history and does not change the 30
ingredients, 12 menu items, existing recipes, or Square.
