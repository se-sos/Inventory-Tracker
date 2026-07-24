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
        low_stock_threshold_oz: 160
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
    squareVariationIds: ['SQUARE-LATTE']
};

test('passes a complete pilot configuration', () => {
    const checks = evaluatePilotConfiguration(validInput);

    assert.equal(
        checks.filter(check => check.status === 'fail').length,
        0
    );
});

test('identifies configuration that would cause inventory drift', () => {
    const checks = evaluatePilotConfiguration({
        ingredients: [{
            ...validInput.ingredients[0],
            gfs_code: null,
            pack_size_oz: null,
            low_stock_threshold_oz: null
        }],
        menuItems: [{
            ...validInput.menuItems[0],
            recipe_id: null
        }],
        recipeIngredients: [],
        squareVariationIds: ['SQUARE-LATTE', 'SQUARE-MOCHA']
    });
    const failedNames = checks
        .filter(check => check.status === 'fail')
        .map(check => check.name);

    assert.deepEqual(failedNames, [
        'GFS receiving codes',
        'Pack sizes',
        'Alert thresholds',
        'Menu recipe mappings',
        'Live Square coverage'
    ]);
});

test('warns when a database mapping no longer exists in Square', () => {
    const checks = evaluatePilotConfiguration({
        ...validInput,
        squareVariationIds: []
    });
    const staleCheck = checks.find(
        check => check.name === 'Stale Square mappings'
    );

    assert.equal(staleCheck?.status, 'warn');
    assert.match(staleCheck?.detail ?? '', /Latte/);
});
