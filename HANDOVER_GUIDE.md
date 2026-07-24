# Ghost Coffee Pilot Handover

## Daily workflow

Square orders reduce ingredient stock automatically when the scheduled order
processor runs. Staff only need to record deliveries:

```bash
npm run receive-stock -- <GFS_CODE> <PACK_COUNT> <STAFF_NAME>
```

Example:

```bash
npm run receive-stock -- BEAN-001 3 Cory
```

The command looks up the ingredient's configured pack size, adds the correct
number of ounces atomically, and writes a receipt record.

## Operations

Run both jobs every 15 minutes:

```bash
npm start
npm run alerts
```

- `npm start` processes all pages of completed Square orders.
- The Square checkpoint lives in Supabase, so changing servers does not reset it.
- `npm run alerts` emails one digest for newly low ingredients.
- A failed run exits with a non-zero status so the scheduler can report it.
- Repeating either job is safe.

## Required secrets

```env
SQUARE_ACCESS_TOKEN=...
SQUARE_ENVIRONMENT=production
SUPABASE_URL=...
SUPABASE_SERVICE_ROLE_KEY=...
RESEND_API_KEY=...
ALERT_EMAIL_FROM=Ghost Coffee Inventory <alerts@your-domain.com>
ALERT_EMAIL_TO=owner@example.com
```

Keep the service-role and API keys only on the server running the jobs.

## Supabase records

- `processed_orders`: proves each Square order was handled once.
- `stock_receipts`: who received stock, how many packs, and the resulting level.
- `low_stock_alerts`: pending, sent, and failed alert attempts.
- `ingredients`: current calculated stock and alert thresholds.
- `inventory`: Square's separate finished-item inventory mirror.

## Recovery

If an order run fails, do not manually change its checkpoint. Fix the reported
error and run `npm start` again; already processed order IDs will be skipped.
An error naming an unmapped Square item means its variation ID needs a recipe
mapping before the run can continue.

If an alert email fails, the affected ingredients are automatically rearmed so
the next scheduled run can retry.

Never run `reset_inventory.ts`, `seed_coffee.ts`, or `delete_item.ts` against
production. They are legacy maintenance utilities, not staff workflows.
