import dotenv from 'dotenv';
import { createClient } from '@supabase/supabase-js';
import {
    SquareClient,
    SquareEnvironment
} from 'square';

dotenv.config();

function requiredEnvironmentVariable(name: string): string {
    const value = process.env[name]?.trim();

    if (!value) {
        throw new Error(`Missing required environment variable: ${name}`);
    }

    return value;
}

function projectReference(supabaseUrl: string): string {
    const hostname = new URL(supabaseUrl).hostname;
    const suffix = '.supabase.co';

    if (!hostname.endsWith(suffix)) {
        throw new Error('SUPABASE_URL is not a Supabase project URL');
    }

    return hostname.slice(0, -suffix.length);
}

async function main() {
    const expectedProjectReference = process.argv[2]?.trim();

    if (!expectedProjectReference) {
        throw new Error(
            'Pass the intended Supabase project reference as the first argument'
        );
    }

    const supabaseUrl = requiredEnvironmentVariable('SUPABASE_URL');
    const actualProjectReference = projectReference(supabaseUrl);

    if (actualProjectReference !== expectedProjectReference) {
        throw new Error(
            `Target mismatch: expected ${expectedProjectReference}, got ${actualProjectReference}`
        );
    }

    if (requiredEnvironmentVariable('SQUARE_ENVIRONMENT') !== 'production') {
        throw new Error('SQUARE_ENVIRONMENT must be production');
    }

    const supabase = createClient(
        supabaseUrl,
        requiredEnvironmentVariable('SUPABASE_SERVICE_ROLE_KEY'),
        {
            auth: {
                autoRefreshToken: false,
                persistSession: false
            }
        }
    );
    const square = new SquareClient({
        token: requiredEnvironmentVariable('SQUARE_ACCESS_TOKEN'),
        environment: SquareEnvironment.Production
    });
    const [
        ingredientsResult,
        menuItemsResult,
        recipesResult,
        validationResult,
        auditResult,
        catalogCacheResult,
        processedOrdersResult,
        checkpointResult,
        locationsResult
    ] = await Promise.all([
        supabase
            .from('ingredients')
            .select('id,is_active'),
        supabase
            .from('menu_items')
            .select('id,is_active'),
        supabase
            .from('recipe_ingredients')
            .select('recipe_id,ingredient_id'),
        supabase.rpc('validate_inventory_setup'),
        supabase
            .from('inventory_setup_activity')
            .select('id', { count: 'exact', head: true }),
        supabase
            .from('square_catalog_variations')
            .select('square_variation_id', { count: 'exact', head: true }),
        supabase
            .from('processed_orders')
            .select('square_order_id', { count: 'exact', head: true }),
        supabase.rpc(
            'get_integration_checkpoint',
            { p_name: 'square-completed-orders' }
        ),
        square.locations.list()
    ]);
    const failures = [
        ['ingredients', ingredientsResult.error],
        ['menu items', menuItemsResult.error],
        ['recipes', recipesResult.error],
        ['validation', validationResult.error],
        ['audit', auditResult.error],
        ['catalog cache', catalogCacheResult.error],
        ['processed orders', processedOrdersResult.error],
        ['checkpoint', checkpointResult.error]
    ] as const;
    const failed = failures.find(([, error]) => error);

    if (failed) {
        throw new Error(`${failed[0]} check failed: ${failed[1]?.message}`);
    }

    const ingredients = ingredientsResult.data ?? [];
    const menuItems = menuItemsResult.data ?? [];
    const recipeLines = recipesResult.data ?? [];
    const issues = validationResult.data ?? [];
    const errors = issues.filter(
        (issue: { severity?: string }) => issue.severity === 'error'
    );
    const warnings = issues.filter(
        (issue: { severity?: string }) => issue.severity === 'warning'
    );

    if (
        ingredients.length !== 30
        || ingredients.some((ingredient) => !ingredient.is_active)
    ) {
        throw new Error('Expected 30 active ingredients');
    }

    if (
        menuItems.length !== 12
        || menuItems.some((menuItem) => !menuItem.is_active)
    ) {
        throw new Error('Expected 12 active menu items');
    }

    if (recipeLines.length !== 44) {
        throw new Error(`Expected 44 recipe lines, found ${recipeLines.length}`);
    }

    if (errors.length > 0) {
        throw new Error(
            `Owner Setup validation returned ${errors.length} error(s)`
        );
    }

    if ((auditResult.count ?? 0) !== 0) {
        throw new Error('Rollback-safe validation left setup audit rows behind');
    }

    if ((processedOrdersResult.count ?? 0) !== 0) {
        throw new Error('Automatic Square order processing is not disabled');
    }

    if (checkpointResult.data !== null) {
        throw new Error('Square sales checkpoint is already initialized');
    }

    let squareItems = 0;
    let squareVariations = 0;
    const catalog = await square.catalog.list({ types: 'ITEM' });

    for await (const object of catalog) {
        if (object.type !== 'ITEM' || object.isDeleted) {
            continue;
        }

        squareItems += 1;
        squareVariations += object.itemData?.variations?.filter(
            (variation) => !variation.isDeleted
        ).length ?? 0;
    }

    console.log(`Verified Supabase project: ${actualProjectReference}`);
    console.log(`Ingredients: ${ingredients.length} active`);
    console.log(`Menu items: ${menuItems.length} active`);
    console.log(`Recipe lines: ${recipeLines.length}`);
    console.log(`Validation errors: ${errors.length}`);
    console.log(`Validation warnings: ${warnings.length}`);
    console.log(`Setup audit rows: ${auditResult.count ?? 0}`);
    console.log(`Cached Square variations: ${catalogCacheResult.count ?? 0}`);
    console.log(`Processed Square orders: ${processedOrdersResult.count ?? 0}`);
    console.log('Square sales checkpoint: uninitialized');
    console.log(
        `Square read-only access: ${locationsResult.locations?.length ?? 0} location(s), ${squareItems} item(s), ${squareVariations} variation(s)`
    );
    console.log('No Supabase or Square rows were changed.');
}

main().catch((error) => {
    console.error(error instanceof Error ? error.message : error);
    process.exitCode = 1;
});
