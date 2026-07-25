# Ghost Coffee Pilot Checklist

The pilot is ready for staff only after every required item below is checked
using Ghost Coffee's production Square and Supabase projects.

## Before testing

- [ ] Create a backup or export of the current Supabase inventory tables.
- [ ] Confirm the three previously installed pilot migrations are present.
- [ ] Run `allow_untracked_square_items.sql`.
- [ ] Run `add_owner_inventory_controls.sql`.
- [ ] Run `harden_inventory_mappings.sql`.
- [ ] Set `pack_size_oz` for every ingredient staff may receive.
- [ ] Set a real `low_stock_threshold_oz` and `max_stock_oz` for every tracked
      ingredient.
- [ ] Confirm every menu item Ghost Coffee chose to track maps to the correct
      `menu_items.square_item_id`. Other Square items are intentionally ignored.
- [ ] Confirm every tracked menu item has a recipe and all recipe quantities
      are accurate.
- [ ] Configure the server-only environment variables from `.env.example`.
- [ ] Run `npm test` and `npm run typecheck`.
- [ ] Physically count inventory and save every starting `current_stock_oz`.
- [ ] Immediately run `npm run initialize-sync` once after saving the count.
- [ ] Run `npm run preflight` and resolve every `FAIL`.

## Live acceptance test

Use a controlled test item and write down its starting ingredient levels.

- [ ] Complete one test order in Square.
- [ ] Run `npm start`.
- [ ] Confirm the expected ingredient quantities were deducted.
- [ ] Run `npm start` again and confirm the order was not deducted twice.
- [ ] Confirm the Square order ID exists once in `processed_orders`.
- [ ] Receive one test pack with `npm run receive-stock --`.
- [ ] Confirm the increase equals `pack_count × pack_size_oz`.
- [ ] Confirm the delivery exists in `stock_receipts`.
- [ ] Put the test ingredient below its threshold and run `npm run alerts`.
- [ ] Confirm one email arrives and its row is `sent` in `low_stock_alerts`.
- [ ] Run `npm run alerts` again and confirm no duplicate email arrives.
- [ ] Restock above the threshold, run alerts once, lower it again, and confirm
      a new alert can be sent.

## Pilot operations

- [ ] Schedule order processing every 15 minutes.
- [ ] Schedule alerts every 15 minutes after order processing.
- [ ] Confirm failed command exits are visible to Sean or Ghost Coffee staff.
- [ ] Give Cory the daily workflow in `HANDOVER_GUIDE.md`.
- [ ] Identify who owns recipe corrections, delivery entry, and alert response.

## Pass condition

The pilot passes when all live acceptance checks succeed without manual
database correction. Until then, keep the processor in supervised pilot use.
