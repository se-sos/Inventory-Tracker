import assert from 'node:assert/strict';
import test from 'node:test';
import {
    buildOwnerInventoryReport,
    renderOwnerInventoryReport
} from './owner_inventory_report';

test('puts reorder items first and calculates the owner summary', () => {
    const report = buildOwnerInventoryReport([
        {
            id: 1,
            name: 'Flour',
            current_stock_oz: 300,
            low_stock_threshold_oz: 100,
            max_stock_oz: 400
        },
        {
            id: 2,
            name: 'Egg',
            current_stock_oz: 20,
            low_stock_threshold_oz: 30,
            max_stock_oz: 90
        }
    ], new Date('2026-07-24T12:00:00.000Z'));

    assert.equal(report.reorderCount, 1);
    assert.equal(report.notConfiguredCount, 0);
    assert.equal(report.items[0].name, 'Egg');
    assert.equal(report.items[0].recommended_add_oz, 70);
    assert.equal(report.items[1].status, 'ok');
});

test('renders missing settings without inventing a reorder amount', () => {
    const report = buildOwnerInventoryReport([{
        id: 3,
        name: 'Avocado Spread',
        current_stock_oz: 4,
        low_stock_threshold_oz: null,
        max_stock_oz: null
    }], new Date('2026-07-24T12:00:00.000Z'));

    const output = renderOwnerInventoryReport(report);

    assert.match(output, /Missing settings: 1/);
    assert.match(
        output,
        /NOT-CONFIGURED \| Avocado Spread \| 4\.00 oz \| — \| — \| —/
    );
});
