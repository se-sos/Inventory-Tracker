import assert from 'node:assert/strict';
import test from 'node:test';
import {
    evaluatePilotConfiguration,
    PreflightInput
} from './pilot_preflight';

const validInput: PreflightInput = {
    ingredients: [{
        id: 1,
        name: 'Espresso Beans',
        gfs_code: 'BEAN-001',
        current_stock_oz: 320,
        pack_size_oz: 80,
        low_stock_threshold_oz: 160,
        max_stock_oz: 320
    }],
    menuItems: [{
        id: 1,
        item_name: 'Latte',
        square_item_id: 'SQUARE-LATTE',
        recipe_id: 'RECIPE-LATTE'
    }],
    recipeIngredients: [{
        recipe_id: 'RECIPE-LATTE',
        ingredient_id: 1,
        quantity_required_oz: 1
    }],
    squareVariationIds: ['SQUARE-LATTE'],
    checkpointAt: '2026-07-25T12:00:00.000Z'
};

test('passes a complete pilot configuration', () => {
    const checks = evaluatePilotConfiguration(validInput);

    assert.equal(
        checks.filter(check => check.status === 'fail').length,
        0
    );
});

test('keeps receiving metadata optional but requires reorder settings', () => {
    const checks = evaluatePilotConfiguration({
        ...validInput,
        ingredients: [{
            ...validInput.ingredients[0],
            gfs_code: null,
            pack_size_oz: null,
            low_stock_threshold_oz: null,
            max_stock_oz: null
        }]
    });
    const failedNames = checks
        .filter(check => check.status === 'fail')
        .map(check => check.name);
    const warnedNames = checks
        .filter(check => check.status === 'warn')
        .map(check => check.name);

    assert.deepEqual(failedNames, [
        'Alert thresholds',
        'Maximum stock'
    ]);
    assert.deepEqual(warnedNames, [
        'GFS receiving codes',
        'Pack sizes'
    ]);
});

test('allows live Square items outside the tracked menu scope', () => {
    const checks = evaluatePilotConfiguration({
        ...validInput,
        squareVariationIds: ['SQUARE-LATTE', 'SQUARE-MOCHA']
    });
    const scopeCheck = checks.find(
        check => check.name === 'Square tracking scope'
    );

    assert.equal(scopeCheck?.status, 'pass');
    assert.match(scopeCheck?.detail ?? '', /1 live Square variation/);
});

test('fails when a tracked database mapping no longer exists in Square', () => {
    const checks = evaluatePilotConfiguration({
        ...validInput,
        squareVariationIds: []
    });
    const staleCheck = checks.find(
        check => check.name === 'Stale Square mappings'
    );

    assert.equal(staleCheck?.status, 'fail');
    assert.match(staleCheck?.detail ?? '', /Latte/);
});

test('fails when tracked stock is negative', () => {
    const checks = evaluatePilotConfiguration({
        ...validInput,
        ingredients: [{
            ...validInput.ingredients[0],
            current_stock_oz: -1
        }]
    });
    const stockCheck = checks.find(check => check.name === 'Stock values');

    assert.equal(stockCheck?.status, 'fail');
    assert.match(stockCheck?.detail ?? '', /Espresso Beans/);
});

test('fails before an explicit Square sync baseline exists', () => {
    const checks = evaluatePilotConfiguration({
        ...validInput,
        checkpointAt: null
    });
    const baselineCheck = checks.find(
        check => check.name === 'Square sync baseline'
    );

    assert.equal(baselineCheck?.status, 'fail');
    assert.match(baselineCheck?.detail ?? '', /initialize-sync/);
});

test('fails duplicate Square and recipe ingredient mappings', () => {
    const checks = evaluatePilotConfiguration({
        ...validInput,
        menuItems: [
            validInput.menuItems[0],
            {
                ...validInput.menuItems[0],
                id: 2,
                item_name: 'Duplicate Latte'
            }
        ],
        recipeIngredients: [
            validInput.recipeIngredients[0],
            validInput.recipeIngredients[0]
        ]
    });

    assert.equal(
        checks.find(check => check.name === 'Unique Square mappings')?.status,
        'fail'
    );
    assert.equal(
        checks.find(
            check => check.name === 'Unique recipe ingredients'
        )?.status,
        'fail'
    );
});
