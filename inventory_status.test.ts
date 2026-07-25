import assert from 'node:assert/strict';
import test from 'node:test';
import { buildInventoryStatus } from './inventory_status';

test('recommends filling a low ingredient back to its maximum', () => {
    const status = buildInventoryStatus({
        id: 1,
        name: 'Hot Chicken',
        current_stock_oz: 18,
        low_stock_threshold_oz: 30,
        max_stock_oz: 80
    });

    assert.equal(status.status, 'reorder');
    assert.equal(status.recommended_add_oz, 62);
});

test('marks stock above its threshold as okay', () => {
    const status = buildInventoryStatus({
        id: 2,
        name: 'Egg',
        current_stock_oz: 42,
        low_stock_threshold_oz: 30,
        max_stock_oz: 100
    });

    assert.equal(status.status, 'ok');
    assert.equal(status.recommended_add_oz, 0);
});

test('does not invent a recommendation without threshold and maximum values', () => {
    const status = buildInventoryStatus({
        id: 3,
        name: 'Avocado Spread',
        current_stock_oz: 22,
        low_stock_threshold_oz: null,
        max_stock_oz: null
    });

    assert.equal(status.status, 'not-configured');
    assert.equal(status.recommended_add_oz, null);
});
