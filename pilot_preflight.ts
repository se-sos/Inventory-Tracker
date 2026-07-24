import { SquareClient, SquareEnvironment } from 'square';
import { createSupabaseAdminClient } from './supabase_admin';

type IngredientRow = {
    id: number;
    name: string;
    gfs_code: string | null;
    current_stock_oz: number;
    pack_size_oz: number | null;
    low_stock_threshold_oz: number | null;
};

type MenuItemRow = {
    id: number;
    item_name: string;
    square_item_id: string | null;
    recipe_id: string | null;
};

type RecipeIngredientRow = {
    recipe_id: string;
    ingredient_id: number;
    quantity_required_oz: number;
};

export type PreflightInput = {
    ingredients: IngredientRow[];
    menuItems: MenuItemRow[];
    recipeIngredients: RecipeIngredientRow[];
    squareVariationIds: string[];
};

export type PreflightCheck = {
    name: string;
    status: 'pass' | 'warn' | 'fail';
    detail: string;
};

function names<T>(rows: T[], getName: (row: T) => string): string {
    return rows.slice(0, 8).map(getName).join(', ')
        + (rows.length > 8 ? `, and ${rows.length - 8} more` : '');
}

export function evaluatePilotConfiguration(
    input: PreflightInput
): PreflightCheck[] {
    const checks: PreflightCheck[] = [];
    const missingCodes = input.ingredients.filter(
        ingredient => !ingredient.gfs_code?.trim()
    );
    const missingPackSizes = input.ingredients.filter(
        ingredient => (
            ingredient.pack_size_oz === null
            || ingredient.pack_size_oz <= 0
        )
    );
    const missingThresholds = input.ingredients.filter(
        ingredient => (
            ingredient.low_stock_threshold_oz === null
            || ingredient.low_stock_threshold_oz < 0
        )
    );
    const invalidStock = input.ingredients.filter(
        ingredient => !Number.isFinite(ingredient.current_stock_oz)
    );
    const incompleteMenuItems = input.menuItems.filter(
        item => !item.square_item_id?.trim() || !item.recipe_id
    );
    const recipeIdsWithIngredients = new Set(
        input.recipeIngredients.map(link => link.recipe_id)
    );
    const emptyRecipes = input.menuItems.filter(
        item => (
            item.recipe_id !== null
            && !recipeIdsWithIngredients.has(item.recipe_id)
        )
    );
    const invalidRecipeQuantities = input.recipeIngredients.filter(
        link => (
            !Number.isFinite(link.quantity_required_oz)
            || link.quantity_required_oz <= 0
        )
    );
    const mappedSquareIds = new Set(
        input.menuItems
            .map(item => item.square_item_id)
            .filter((id): id is string => Boolean(id))
    );
    const liveSquareIds = new Set(input.squareVariationIds);
    const unmappedSquareIds = input.squareVariationIds.filter(
        id => !mappedSquareIds.has(id)
    );
    const staleMappings = input.menuItems.filter(
        item => (
            Boolean(item.square_item_id)
            && !liveSquareIds.has(item.square_item_id as string)
        )
    );

    checks.push({
        name: 'Ingredients loaded',
        status: input.ingredients.length > 0 ? 'pass' : 'fail',
        detail: input.ingredients.length > 0
            ? `${input.ingredients.length} ingredient(s) found.`
            : 'No ingredients were found.'
    });
    checks.push({
        name: 'GFS receiving codes',
        status: missingCodes.length === 0 ? 'pass' : 'fail',
        detail: missingCodes.length === 0
            ? 'Every ingredient has a receiving code.'
            : `Missing codes: ${names(missingCodes, row => row.name)}.`
    });
    checks.push({
        name: 'Pack sizes',
        status: missingPackSizes.length === 0 ? 'pass' : 'fail',
        detail: missingPackSizes.length === 0
            ? 'Every ingredient has a positive pack size.'
            : `Missing pack sizes: ${names(missingPackSizes, row => row.name)}.`
    });
    checks.push({
        name: 'Alert thresholds',
        status: missingThresholds.length === 0 ? 'pass' : 'fail',
        detail: missingThresholds.length === 0
            ? 'Every ingredient has a low-stock threshold.'
            : `Missing thresholds: ${names(missingThresholds, row => row.name)}.`
    });
    checks.push({
        name: 'Stock values',
        status: invalidStock.length === 0 ? 'pass' : 'fail',
        detail: invalidStock.length === 0
            ? 'Every ingredient has a numeric stock value.'
            : `Invalid stock: ${names(invalidStock, row => row.name)}.`
    });
    checks.push({
        name: 'Menu recipe mappings',
        status: incompleteMenuItems.length === 0 ? 'pass' : 'fail',
        detail: incompleteMenuItems.length === 0
            ? 'Every menu item has a Square variation and recipe.'
            : `Incomplete mappings: ${names(incompleteMenuItems, row => row.item_name)}.`
    });
    checks.push({
        name: 'Recipe ingredients',
        status: emptyRecipes.length === 0 ? 'pass' : 'fail',
        detail: emptyRecipes.length === 0
            ? 'Every mapped recipe contains ingredients.'
            : `Recipes without ingredients: ${names(emptyRecipes, row => row.item_name)}.`
    });
    checks.push({
        name: 'Recipe quantities',
        status: invalidRecipeQuantities.length === 0 ? 'pass' : 'fail',
        detail: invalidRecipeQuantities.length === 0
            ? 'Every recipe quantity is positive.'
            : `${invalidRecipeQuantities.length} recipe link(s) have invalid quantities.`
    });
    checks.push({
        name: 'Live Square coverage',
        status: unmappedSquareIds.length === 0 ? 'pass' : 'fail',
        detail: unmappedSquareIds.length === 0
            ? 'Every live Square variation is mapped.'
            : `Unmapped Square variation IDs: ${names(unmappedSquareIds, id => id)}.`
    });
    checks.push({
        name: 'Stale Square mappings',
        status: staleMappings.length === 0 ? 'pass' : 'warn',
        detail: staleMappings.length === 0
            ? 'No stale menu mappings found.'
            : `Not found in the live catalog: ${names(staleMappings, row => row.item_name)}.`
    });

    return checks;
}

function requireEnvironmentVariable(name: string): string {
    const value = process.env[name]?.trim();

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

async function assertOperationalTables(
    supabase: ReturnType<typeof createSupabaseAdminClient>
) {
    const tableNames = [
        'processed_orders',
        'integration_checkpoints',
        'stock_receipts',
        'low_stock_alerts'
    ];

    for (const tableName of tableNames) {
        const { error } = await supabase
            .from(tableName)
            .select('*')
            .limit(1);

        if (error) {
            throw new Error(
                `Supabase table ${tableName} is unavailable: ${error.message}`
            );
        }
    }
}

async function main() {
    try {
        const squareEnvironment = requireEnvironmentVariable(
            'SQUARE_ENVIRONMENT'
        );

        if (squareEnvironment !== 'production') {
            throw new Error(
                'SQUARE_ENVIRONMENT must be production for the live pilot preflight'
            );
        }

        requireEnvironmentVariable('RESEND_API_KEY');
        requireEnvironmentVariable('ALERT_EMAIL_FROM');
        requireEnvironmentVariable('ALERT_EMAIL_TO');

        const supabase = createSupabaseAdminClient();
        const square = new SquareClient({
            token: requireEnvironmentVariable('SQUARE_ACCESS_TOKEN'),
            environment: SquareEnvironment.Production
        });

        await assertOperationalTables(supabase);

        const [
            ingredientsResult,
            menuItemsResult,
            recipeIngredientsResult,
            locationsResult
        ] = await Promise.all([
            supabase
                .from('ingredients')
                .select(
                    'id,name,gfs_code,current_stock_oz,pack_size_oz,low_stock_threshold_oz'
                ),
            supabase
                .from('menu_items')
                .select('id,item_name,square_item_id,recipe_id'),
            supabase
                .from('recipe_ingredients')
                .select('recipe_id,ingredient_id,quantity_required_oz'),
            square.locations.list()
        ]);

        if (ingredientsResult.error) {
            throw new Error(
                `Could not read ingredients: ${ingredientsResult.error.message}`
            );
        }
        if (menuItemsResult.error) {
            throw new Error(
                `Could not read menu items: ${menuItemsResult.error.message}`
            );
        }
        if (recipeIngredientsResult.error) {
            throw new Error(
                `Could not read recipe ingredients: ${recipeIngredientsResult.error.message}`
            );
        }
        if (!locationsResult.locations?.length) {
            throw new Error('Square returned no production locations');
        }

        const squareVariationIds: string[] = [];
        const catalog = await square.catalog.list({ types: 'ITEM' });

        for await (const object of catalog) {
            if (object.type !== 'ITEM' || object.isDeleted) {
                continue;
            }

            for (const variation of object.itemData?.variations ?? []) {
                if (
                    variation.type === 'ITEM_VARIATION'
                    && !variation.isDeleted
                    && variation.id
                ) {
                    squareVariationIds.push(variation.id);
                }
            }
        }

        const checks = evaluatePilotConfiguration({
            ingredients: ingredientsResult.data ?? [],
            menuItems: menuItemsResult.data ?? [],
            recipeIngredients: recipeIngredientsResult.data ?? [],
            squareVariationIds
        });

        console.log(
            `Connected to ${locationsResult.locations.length} Square location(s).`
        );
        console.log('Supabase operational tables are installed.');

        for (const check of checks) {
            console.log(
                `[${check.status.toUpperCase()}] ${check.name}: ${check.detail}`
            );
        }

        const failures = checks.filter(check => check.status === 'fail');

        if (failures.length > 0) {
            console.error(
                `Preflight failed with ${failures.length} blocking check(s).`
            );
            process.exitCode = 1;
            return;
        }

        console.log('Pilot preflight passed.');
    } catch (error) {
        console.error(
            error instanceof Error ? error.message : 'Pilot preflight failed'
        );
        process.exitCode = 1;
    }
}

if (require.main === module) {
    main();
}
