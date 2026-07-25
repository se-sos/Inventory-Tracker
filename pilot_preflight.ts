import { SquareClient, SquareEnvironment } from 'square';
import { createSupabaseAdminClient } from './supabase_admin';

type IngredientRow = {
    id: number;
    name: string;
    gfs_code: string | null;
    current_stock_oz: number;
    pack_size_oz: number | null;
    low_stock_threshold_oz: number | null;
    max_stock_oz: number | null;
};

type MenuItemRow = {
    id: number;
    item_name: string;
    square_item_id: string | null;
    recipe_id: string | null;
};

type RecipeIngredientRow = {
    recipe_id: string | null;
    ingredient_id: number | null;
    quantity_required_oz: number;
};

export type PreflightInput = {
    ingredients: IngredientRow[];
    menuItems: MenuItemRow[];
    recipeIngredients: RecipeIngredientRow[];
    squareVariationIds: string[];
    checkpointAt: string | null;
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
    const trackedIngredientIds = new Set(
        input.recipeIngredients
            .map(link => link.ingredient_id)
            .filter((id): id is number => id !== null)
    );
    const trackedIngredients = input.ingredients.filter(
        ingredient => trackedIngredientIds.has(ingredient.id)
    );
    const missingCodes = trackedIngredients.filter(
        ingredient => !ingredient.gfs_code?.trim()
    );
    const missingPackSizes = trackedIngredients.filter(
        ingredient => (
            ingredient.pack_size_oz === null
            || !Number.isFinite(ingredient.pack_size_oz)
            || ingredient.pack_size_oz <= 0
        )
    );
    const missingThresholds = trackedIngredients.filter(
        ingredient => (
            ingredient.low_stock_threshold_oz === null
            || !Number.isFinite(ingredient.low_stock_threshold_oz)
            || ingredient.low_stock_threshold_oz < 0
        )
    );
    const invalidMaximums = trackedIngredients.filter(
        ingredient => (
            ingredient.max_stock_oz === null
            || !Number.isFinite(ingredient.max_stock_oz)
            || ingredient.max_stock_oz <= 0
            || (
                ingredient.low_stock_threshold_oz !== null
                && ingredient.max_stock_oz
                    < ingredient.low_stock_threshold_oz
            )
        )
    );
    const invalidStock = trackedIngredients.filter(
        ingredient => (
            !Number.isFinite(ingredient.current_stock_oz)
            || ingredient.current_stock_oz < 0
        )
    );
    const incompleteMenuItems = input.menuItems.filter(
        item => !item.square_item_id?.trim() || !item.recipe_id
    );
    const recipeIdsWithIngredients = new Set(
        input.recipeIngredients
            .map(link => link.recipe_id)
            .filter((id): id is string => id !== null)
    );
    const emptyRecipes = input.menuItems.filter(
        item => (
            item.recipe_id !== null
            && !recipeIdsWithIngredients.has(item.recipe_id)
        )
    );
    const invalidRecipeQuantities = input.recipeIngredients.filter(
        link => (
            link.recipe_id === null
            || link.ingredient_id === null
            ||
            !Number.isFinite(link.quantity_required_oz)
            || link.quantity_required_oz <= 0
        )
    );
    const squareMappingCounts = new Map<string, number>();

    for (const item of input.menuItems) {
        const squareId = item.square_item_id?.trim();

        if (squareId) {
            squareMappingCounts.set(
                squareId,
                (squareMappingCounts.get(squareId) ?? 0) + 1
            );
        }
    }

    const duplicateSquareMappings = [...squareMappingCounts]
        .filter(([, count]) => count > 1)
        .map(([squareId]) => squareId);
    const recipeIngredientCounts = new Map<string, number>();

    for (const link of input.recipeIngredients) {
        if (link.recipe_id === null || link.ingredient_id === null) {
            continue;
        }

        const key = `${link.recipe_id}:${link.ingredient_id}`;
        recipeIngredientCounts.set(
            key,
            (recipeIngredientCounts.get(key) ?? 0) + 1
        );
    }

    const duplicateRecipeIngredients = [...recipeIngredientCounts]
        .filter(([, count]) => count > 1)
        .map(([key]) => key);
    const mappedSquareIds = new Set(
        input.menuItems
            .map(item => item.square_item_id)
            .filter((id): id is string => Boolean(id))
            .map(id => id.trim())
    );
    const liveSquareIds = new Set(input.squareVariationIds);
    const untrackedSquareIds = input.squareVariationIds.filter(
        id => !mappedSquareIds.has(id)
    );
    const staleMappings = input.menuItems.filter(
        item => (
            Boolean(item.square_item_id)
            && !liveSquareIds.has(item.square_item_id as string)
        )
    );
    const checkpointIsValid = (
        input.checkpointAt !== null
        && !Number.isNaN(new Date(input.checkpointAt).getTime())
    );

    checks.push({
        name: 'Ingredients loaded',
        status: input.ingredients.length > 0 ? 'pass' : 'fail',
        detail: input.ingredients.length > 0
            ? `${input.ingredients.length} ingredient(s) found.`
            : 'No ingredients were found.'
    });
    checks.push({
        name: 'Tracked food menu loaded',
        status: input.menuItems.length > 0 ? 'pass' : 'fail',
        detail: input.menuItems.length > 0
            ? `${input.menuItems.length} tracked food menu item(s) found.`
            : 'No tracked food menu items were found.'
    });
    checks.push({
        name: 'Square sync baseline',
        status: checkpointIsValid ? 'pass' : 'fail',
        detail: checkpointIsValid
            ? `Order tracking starts from ${input.checkpointAt}.`
            : 'Record the physical starting inventory, then run `npm run initialize-sync`.'
    });
    checks.push({
        name: 'GFS receiving codes',
        status: missingCodes.length === 0 ? 'pass' : 'warn',
        detail: missingCodes.length === 0
            ? 'Every ingredient has a receiving code.'
            : `Optional pack receiving is unavailable for: ${names(missingCodes, row => row.name)}. Order deductions are unaffected.`
    });
    checks.push({
        name: 'Pack sizes',
        status: missingPackSizes.length === 0 ? 'pass' : 'warn',
        detail: missingPackSizes.length === 0
            ? 'Every ingredient has a positive pack size.'
            : `Optional pack receiving is unavailable for: ${names(missingPackSizes, row => row.name)}. Order deductions are unaffected.`
    });
    checks.push({
        name: 'Alert thresholds',
        status: missingThresholds.length === 0 ? 'pass' : 'fail',
        detail: missingThresholds.length === 0
            ? 'Every tracked ingredient has a restock threshold.'
            : `Missing restock thresholds: ${names(missingThresholds, row => row.name)}.`
    });
    checks.push({
        name: 'Maximum stock',
        status: invalidMaximums.length === 0 ? 'pass' : 'fail',
        detail: invalidMaximums.length === 0
            ? 'Every tracked ingredient has a valid maximum above its threshold.'
            : `Missing or invalid maximums: ${names(invalidMaximums, row => row.name)}.`
    });
    checks.push({
        name: 'Stock values',
        status: invalidStock.length === 0 ? 'pass' : 'fail',
        detail: invalidStock.length === 0
            ? 'Every tracked ingredient has a non-negative numeric stock value.'
            : `Invalid or negative stock: ${names(invalidStock, row => row.name)}.`
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
        name: 'Unique Square mappings',
        status: duplicateSquareMappings.length === 0 ? 'pass' : 'fail',
        detail: duplicateSquareMappings.length === 0
            ? 'Every Square variation maps to at most one tracked menu item.'
            : `Duplicate Square variation IDs: ${names(duplicateSquareMappings, id => id)}.`
    });
    checks.push({
        name: 'Unique recipe ingredients',
        status: duplicateRecipeIngredients.length === 0 ? 'pass' : 'fail',
        detail: duplicateRecipeIngredients.length === 0
            ? 'Every recipe contains at most one row per ingredient.'
            : `${duplicateRecipeIngredients.length} duplicate recipe/ingredient pair(s) found.`
    });
    checks.push({
        name: 'Square tracking scope',
        status: 'pass',
        detail: untrackedSquareIds.length === 0
            ? 'Every live Square variation is in the tracked menu scope.'
            : `${untrackedSquareIds.length} live Square variation(s) are outside the tracked menu scope and will be ignored.`
    });
    checks.push({
        name: 'Stale Square mappings',
        status: staleMappings.length === 0 ? 'pass' : 'fail',
        detail: staleMappings.length === 0
            ? 'No stale menu mappings found.'
            : `Tracked menu items not found in the live catalog: ${names(staleMappings, row => row.item_name)}.`
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
        'low_stock_alerts',
        'inventory_adjustments'
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

async function loadActiveIngredientsForPreflight(
    supabase: ReturnType<typeof createSupabaseAdminClient>
) {
    const select = () => supabase
        .from('ingredients')
        .select(
            'id,name,gfs_code,current_stock_oz,pack_size_oz,low_stock_threshold_oz,max_stock_oz'
        );
    const activeResult = await select().eq('is_active', true);

    if (
        activeResult.error?.code === '42703'
        || activeResult.error?.message.includes('is_active')
    ) {
        return select();
    }

    return activeResult;
}

async function loadActiveMenuItemsForPreflight(
    supabase: ReturnType<typeof createSupabaseAdminClient>
) {
    const select = () => supabase
        .from('menu_items')
        .select('id,item_name,square_item_id,recipe_id');
    const activeResult = await select().eq('is_active', true);

    if (
        activeResult.error?.code === '42703'
        || activeResult.error?.message.includes('is_active')
    ) {
        return select();
    }

    return activeResult;
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
            locationsResult,
            checkpointResult
        ] = await Promise.all([
            loadActiveIngredientsForPreflight(supabase),
            loadActiveMenuItemsForPreflight(supabase),
            supabase
                .from('recipe_ingredients')
                .select('recipe_id,ingredient_id,quantity_required_oz'),
            square.locations.list(),
            supabase.rpc(
                'get_integration_checkpoint',
                { p_name: 'square-completed-orders' }
            )
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
        if (checkpointResult.error) {
            throw new Error(
                `Could not read Square sync baseline: ${checkpointResult.error.message}`
            );
        }
        if (
            checkpointResult.data !== null
            && typeof checkpointResult.data !== 'string'
        ) {
            throw new Error('Supabase returned an invalid Square sync baseline');
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
            squareVariationIds,
            checkpointAt: checkpointResult.data
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
