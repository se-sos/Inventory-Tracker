# Ghost Coffee Inventory Tracker

This service turns completed Square orders into ingredient-level inventory
deductions in Supabase. It also records deliveries and sends one email when an
ingredient crosses its configured low-stock threshold.

## What the pilot does

- Reads every page of completed Square orders.
- Stores the order checkpoint in Supabase so restarts do not lose progress.
- Deducts each recipe's ingredients in one database transaction.
- Never deducts the same Square order twice.
- Receives deliveries by pack count and configured pack size.
- Keeps an audit trail of processed orders, stock receipts, and alerts.
- Suppresses repeat low-stock emails until the ingredient is restocked.

## Install

Requires Node.js 20 or newer.

```bash
npm install
Copy-Item .env.example .env
```

Fill in `.env`. The Supabase service-role key is server-only: never expose it
in a browser, screenshot, or committed file.

## Install the Supabase changes

Run these files in the Supabase SQL Editor in this order:

1. `add_processed_orders.sql`
2. `add_stock_receiving.sql`
3. `add_low_stock_alerts.sql`

The existing `ingredients`, `menu_items`, `recipes`, and
`recipe_ingredients` tables must already exist.

Then configure each monitored ingredient:

```sql
update public.ingredients
set
  pack_size_oz = 80,
  low_stock_threshold_oz = 160
where gfs_code = 'BEAN-001';
```

Use the real pack size and reorder threshold for each ingredient.

## Commands

```bash
# Process completed Square orders once
npm start

# Refresh Square's catalog-level inventory mirror
npm run sync-catalog

# Receive three packs and record who received them
npm run receive-stock -- BEAN-001 3 Sean

# Send one digest for newly low ingredients
npm run alerts

# Verify the code
npm test
npm run typecheck
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

Local automated verification is green. Production still requires the SQL files
to be applied, real ingredient pack sizes and thresholds to be configured, and
the live checks in `PILOT_CHECKLIST.md` to pass.
