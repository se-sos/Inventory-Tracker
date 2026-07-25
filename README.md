# Ghost Coffee Inventory Tracker

This service turns completed Square orders into ingredient-level inventory
deductions in Supabase. It also records deliveries and sends one email when an
ingredient crosses its configured low-stock threshold.

The private owner dashboard lives in `dashboard/`. It is designed to run on a
Raspberry Pi at the store and provides reorder recommendations, physical-count
corrections, delivery intake, and an audit trail. Raspberry Pi service examples
are in `deploy/raspberry-pi/`.

The dashboard also includes a read-only-by-default Owner Setup area for
ingredients, tracked food items, recipe amounts, and configuration validation.
Follow `OWNER_SETUP_ROLLOUT.md`; do not enable writes before
`add_owner_setup_controls.sql` and the read-only review are complete.

## What the pilot does

- Reads every page of completed Square orders.
- Stores the order checkpoint in Supabase so restarts do not lose progress.
- Deducts each recipe's ingredients in one database transaction.
- Never deducts the same Square order twice.
- Ignores Square items outside Ghost Coffee's configured tracking scope.
- Stops if a tracked Square item is missing its recipe ingredients.
- Receives deliveries by pack count and configured pack size.
- Keeps an audit trail of processed orders, stock receipts, and alerts.
- Suppresses repeat low-stock emails until the ingredient is restocked.
- Calculates which ingredients are below their restock threshold and how much
  must be added to reach the configured maximum.
- Records owner-entered stock, threshold, and maximum changes.

## Install

Requires Node.js 20 or newer.

```bash
npm install
Copy-Item .env.example .env
```

Fill in `.env`. The Supabase service-role key is server-only: never expose it
in a browser, screenshot, or committed file.

## Install the Supabase changes

For a clean installation, run these files in the Supabase SQL Editor in this
order:

1. `add_pack_size.sql`
2. `add_processed_orders.sql`
3. `add_stock_receiving.sql`
4. `add_low_stock_alerts.sql`
5. `add_owner_inventory_controls.sql`
6. `harden_inventory_mappings.sql`
7. `add_owner_setup_controls.sql`

For the existing Ghost Coffee database, where the first three pilot migrations
are already installed, run:

1. `allow_untracked_square_items.sql`
2. `add_owner_inventory_controls.sql`
3. `harden_inventory_mappings.sql`
4. `add_owner_setup_controls.sql`

The existing `ingredients`, `menu_items`, `recipes`, and
`recipe_ingredients` tables must already exist.

Pack receiving is optional. Every tracked ingredient does require a real
restock threshold and maximum for the owner report:

```sql
update public.ingredients
set
  pack_size_oz = 80,
  low_stock_threshold_oz = 160,
  max_stock_oz = 320
where gfs_code = 'BEAN-001';
```

Use Ghost Coffee's real values. Missing receiving metadata does not stop Square
order deductions, but missing thresholds or maximums will block pilot
readiness.

## Establish the starting point

The first sync deliberately refuses to guess how far back it should read.

1. Physically count the starting ingredient inventory.
2. Save those counts, restock thresholds, and maximums in Supabase.
3. Run `npm run initialize-sync` once.
4. Complete the controlled test order from `PILOT_CHECKLIST.md`.

This prevents orders already reflected in the physical count from being
deducted a second time.

## Commands

```bash
# Process completed Square orders once
npm start

# Start tracking orders from now after the physical stock count
npm run initialize-sync

# Refresh Square's catalog-level inventory mirror
npm run sync-catalog

# Receive three packs and record who received them
npm run receive-stock -- BEAN-001 3 Sean

# Print the owner's current stock and reorder report (read-only)
npm run inventory-status

# Send one digest for newly low ingredients
npm run alerts

# Verify the code
npm test
npm run typecheck

# Read-only production readiness report
npm run preflight
```

Schedule `npm start` and `npm run alerts` every 15 minutes. Both commands are
safe to repeat: order processing is idempotent and alerts stay suppressed until
restocking rearms them.

## Important distinction

The `inventory` table mirrors finished-item counts reported by Square.
The `ingredients` table is the operational stock estimate calculated from
recipes and deliveries. Ghost Coffee's low-stock decisions should use
`ingredients`.

## Launch status

Local automated verification is green. Production still requires the pending
SQL files to be applied, starting stock and owner reorder settings to be
confirmed, the sync baseline to be initialized, and the live checks in
`PILOT_CHECKLIST.md` to pass. The owner web dashboard and daily digest are the
next product phase.
