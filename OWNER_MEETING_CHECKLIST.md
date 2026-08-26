# Ghost Coffee Owner Validation Meeting

This meeting is for confirming store facts, not installing software. Do not ask
for passwords, API keys, or payment information during the meeting.

## Required answers from the owner

### What Ghost Coffee wants tracked

- [ ] Confirm the final ingredient list. Add or remove an ingredient only when
      the owner explicitly approves it.
- [ ] Confirm the final food menu items that should reduce ingredient stock.
      Drinks and unapproved Square items remain outside the pilot.
- [ ] Identify any menu sizes or variations that use different ingredient
      amounts.

### Real inventory settings

For every tracked ingredient, record:

- [ ] Current physical amount on hand, measured in ounces.
- [ ] Restock threshold: the amount where the owner wants a warning.
- [ ] Maximum capacity: the amount the store wants to reach after reordering.
- [ ] Pack size in ounces, if the ingredient will be received by package count.
- [ ] GFS/product code, when one exists.

Do not use the current placeholder thresholds or capacities as owner-approved
values.

### Recipe confirmation

- [ ] For one sale of each tracked food item, confirm every ingredient used.
- [ ] Confirm the amount of each ingredient removed per sale.
- [ ] Confirm how substitutions, add-ons, and unavailable ingredients should be
      handled during the pilot.

### Daily responsibility

- [ ] Name the person who records deliveries.
- [ ] Name the person allowed to correct physical counts or recipes.
- [ ] Confirm who receives low-stock alerts and how quickly they should respond.
- [ ] Confirm whether the owner needs access only at the store or remotely.

## Technical rollout after the owner answers

These steps are Sean's technical checklist; the owner does not need to perform
them.

- [ ] Save a Supabase backup and verify the intended Ghost Coffee project.
- [ ] Verify the required database changes directly; do not rely on commit names
      or old screenshots as proof.
- [ ] Enter the owner-approved counts and settings once.
- [ ] Run the readiness report and resolve every failure.
- [ ] Install and test the dashboard on the Raspberry Pi.
- [ ] Keep Square read-only and keep automatic order processing disabled.
- [ ] After the physical count, initialize the order checkpoint once.
- [ ] Run one controlled food order and verify the exact ingredient deductions.
- [ ] Run the same processing step again and confirm there is no duplicate
      deduction.
- [ ] Test one delivery and one low-stock alert.
- [ ] Obtain owner approval before scheduling automatic processing.

## Ready-to-launch definition

The pilot is ready only when the owner has approved the operating values, the
Raspberry Pi works at the store, and every controlled test passes without a
manual database correction. Until then, the public dashboard is a read-only
review tool—not proof of a completed store rollout.
