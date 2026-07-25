# Ghost Coffee Inventory Tracker

## Primary deliverable

Give the owner a reliable daily view of ingredient inventory based on completed
Square food orders:

- current estimated stock;
- the owner's restock threshold;
- the owner's maximum stock level;
- which ingredients need reordering; and
- how much should be added to return each low ingredient to its maximum.

The owner web dashboard and daily email digest are the next product phase. A
separate employee order display is outside the current pilot scope.

## Current backend flow

1. A scheduled command reads completed orders from Square.
2. Only food variations configured in `menu_items` are tracked.
3. Each tracked item resolves to a recipe and its ingredient quantities.
4. Supabase deducts those ingredients in one transaction.
5. The Square order ID is recorded so it cannot be deducted twice.
6. A durable checkpoint records the completed time window.

The service runs once per scheduler invocation. It does not run a permanent
loop, write to Square, or track drinks and unrelated catalog products.

## Inventory operations

- Deliveries can be recorded by GFS code and pack count when pack metadata is
  configured.
- Low-stock email alerts can be sent without repeating until an ingredient is
  restocked.
- Owner-entered stock, threshold, and maximum changes are written through an
  audited database function.

## Remaining launch work

- Apply the pending Supabase migrations.
- Confirm recipe mappings and quantities.
- Physically count starting inventory.
- Enter real thresholds and maximum stock values.
- Initialize the Square sync baseline.
- Pass the controlled live order test.
- Build the owner dashboard and daily digest.
