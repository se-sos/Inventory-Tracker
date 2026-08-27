import "server-only";

import { createSupabaseAdminClient } from "./supabase";
import { getDemoOwnerSetupData } from "./demo-data";
import { demoModeIsEnabled } from "./demo-mode";

export type SetupIngredient = {
  id: number;
  name: string;
  currentStockOz: number;
  thresholdOz: number;
  maxStockOz: number;
  gfsCode: string;
  packSizeOz: number | null;
};

export type RecipeLine = {
  ingredientId: number;
  quantityOz: number;
};

export type SetupMenuItem = {
  id: number;
  name: string;
  squareItemId: string;
  recipeId: string;
  recipeLines: RecipeLine[];
};

export type CatalogVariation = {
  id: string;
  displayName: string;
  sku: string;
};

export type SetupValidationIssue = {
  key: string;
  severity: "error" | "warning";
  area: "ingredient" | "menu_item";
  entityId: string;
  message: string;
};

export type SetupActivity = {
  id: string;
  action: string;
  entityName: string;
  actor: string;
  occurredAt: string;
};

export type OwnerSetupData = {
  ingredients: SetupIngredient[];
  menuItems: SetupMenuItem[];
  catalogVariations: CatalogVariation[];
  validationIssues: SetupValidationIssue[];
  activities: SetupActivity[];
  catalogRefreshedAt: string | null;
};

type IngredientRow = {
  id: number;
  name: string;
  current_stock_oz: number | string;
  low_stock_threshold_oz: number | string;
  max_stock_oz: number | string;
  gfs_code: string | null;
  pack_size_oz: number | string | null;
};

type MenuItemRow = {
  id: number;
  item_name: string;
  square_item_id: string;
  recipe_id: string;
};

type RecipeLineRow = {
  recipe_id: string;
  ingredient_id: number;
  quantity_required_oz: number | string;
};

type ValidationRow = {
  issue_key: string;
  severity: "error" | "warning";
  area: "ingredient" | "menu_item";
  entity_id: string;
  message: string;
};

type ActivityRow = {
  id: string;
  action: string;
  entity_name: string | null;
  changed_by: string | null;
  changed_at: string;
};

function numeric(value: number | string): number {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error("Supabase returned an invalid numeric value");
  }

  return parsed;
}

function migrationIsNotInstalled(
  error: { code?: string; message?: string } | null,
): boolean {
  if (!error) {
    return false;
  }

  return (
    ["42P01", "42703", "PGRST202", "PGRST205"].includes(error.code ?? "")
    || Boolean(
      error.message?.includes("is_active")
      || error.message?.includes("square_catalog_variations")
      || error.message?.includes("inventory_setup_activity")
      || error.message?.includes("validate_inventory_setup"),
    )
  );
}

async function loadIngredients(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
) {
  const select = () => supabase
    .from("ingredients")
    .select(
      "id,name,current_stock_oz,low_stock_threshold_oz,max_stock_oz,gfs_code,pack_size_oz",
    );
  const activeResult = await select()
    .eq("is_active", true)
    .order("name");

  return migrationIsNotInstalled(activeResult.error)
    ? select().order("name")
    : activeResult;
}

async function loadMenuItems(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
) {
  const select = () => supabase
    .from("menu_items")
    .select("id,item_name,square_item_id,recipe_id");
  const activeResult = await select()
    .eq("is_active", true)
    .order("item_name");

  return migrationIsNotInstalled(activeResult.error)
    ? select().order("item_name")
    : activeResult;
}

function localValidation(
  ingredients: SetupIngredient[],
  menuItems: SetupMenuItem[],
  catalogIsReady: boolean,
): SetupValidationIssue[] {
  const issues: SetupValidationIssue[] = [];
  const ingredientById = new Map(
    ingredients.map((ingredient) => [ingredient.id, ingredient]),
  );

  for (const ingredient of ingredients) {
    if (
      ingredient.currentStockOz < 0
      || ingredient.thresholdOz < 0
      || ingredient.maxStockOz <= 0
      || ingredient.thresholdOz > ingredient.maxStockOz
    ) {
      issues.push({
        key: `ingredient-levels-${ingredient.id}`,
        severity: "error",
        area: "ingredient",
        entityId: String(ingredient.id),
        message: `${ingredient.name} has invalid stock, threshold, or maximum values.`,
      });
    }

    if (
      Boolean(ingredient.gfsCode) !== Boolean(ingredient.packSizeOz)
      || (ingredient.packSizeOz !== null && ingredient.packSizeOz <= 0)
    ) {
      issues.push({
        key: `ingredient-receiving-${ingredient.id}`,
        severity: "warning",
        area: "ingredient",
        entityId: String(ingredient.id),
        message: `${ingredient.name} needs both a GFS code and positive pack size for delivery intake.`,
      });
    }
  }

  for (const menuItem of menuItems) {
    if (!menuItem.recipeLines.length) {
      issues.push({
        key: `menu-recipe-${menuItem.id}`,
        severity: "error",
        area: "menu_item",
        entityId: String(menuItem.id),
        message: `${menuItem.name} has no recipe ingredients.`,
      });
    }

    const seenIngredients = new Set<number>();

    for (const line of menuItem.recipeLines) {
      if (
        line.quantityOz <= 0
        || !ingredientById.has(line.ingredientId)
      ) {
        issues.push({
          key: `menu-line-${menuItem.id}-${line.ingredientId}`,
          severity: "error",
          area: "menu_item",
          entityId: String(menuItem.id),
          message: `${menuItem.name} has an invalid ingredient or recipe amount.`,
        });
      }

      if (seenIngredients.has(line.ingredientId)) {
        issues.push({
          key: `menu-duplicate-${menuItem.id}-${line.ingredientId}`,
          severity: "error",
          area: "menu_item",
          entityId: String(menuItem.id),
          message: `${menuItem.name} lists the same ingredient more than once.`,
        });
      }

      seenIngredients.add(line.ingredientId);
    }
  }

  if (!catalogIsReady) {
    issues.push({
      key: "square-catalog-not-installed",
      severity: "warning",
      area: "menu_item",
      entityId: "catalog",
      message: "Square catalog refresh stays locked until the Owner Setup migration is installed.",
    });
  }

  return issues;
}

export async function getOwnerSetupData(): Promise<OwnerSetupData> {
  if (demoModeIsEnabled()) {
    return getDemoOwnerSetupData();
  }

  const supabase = createSupabaseAdminClient();
  const [
    ingredientResult,
    menuItemResult,
    recipeLineResult,
    catalogResult,
    validationResult,
    activityResult,
  ] = await Promise.all([
    loadIngredients(supabase),
    loadMenuItems(supabase),
    supabase
      .from("recipe_ingredients")
      .select("recipe_id,ingredient_id,quantity_required_oz"),
    supabase
      .from("square_catalog_variations")
      .select(
        "square_variation_id,display_name,sku,refreshed_at",
      )
      .eq("is_available", true)
      .order("display_name"),
    supabase.rpc("validate_inventory_setup"),
    supabase
      .from("inventory_setup_activity")
      .select("id,action,entity_name,changed_by,changed_at")
      .order("changed_at", { ascending: false })
      .limit(16),
  ]);

  const requiredFailures = [
    ["ingredients", ingredientResult.error],
    ["menu items", menuItemResult.error],
    ["recipe amounts", recipeLineResult.error],
  ] as const;
  const optionalFailures = [
    ["Square catalog", catalogResult.error],
    ["validation", validationResult.error],
    ["setup activity", activityResult.error],
  ] as const;
  const failed = (
    requiredFailures.find(([, failure]) => failure)
    ?? optionalFailures.find(
      ([, failure]) => failure && !migrationIsNotInstalled(failure),
    )
  );

  if (failed) {
    throw new Error(
      `Could not load Owner Setup ${failed[0]}: ${failed[1]?.message}`,
    );
  }

  const ingredients = (
    (ingredientResult.data ?? []) as IngredientRow[]
  ).map((row) => ({
    id: row.id,
    name: row.name,
    currentStockOz: numeric(row.current_stock_oz),
    thresholdOz: numeric(row.low_stock_threshold_oz),
    maxStockOz: numeric(row.max_stock_oz),
    gfsCode: row.gfs_code ?? "",
    packSizeOz: row.pack_size_oz === null
      ? null
      : numeric(row.pack_size_oz),
  }));
  const recipeLines = (
    (recipeLineResult.data ?? []) as RecipeLineRow[]
  ).map((row) => ({
    recipeId: row.recipe_id,
    ingredientId: row.ingredient_id,
    quantityOz: numeric(row.quantity_required_oz),
  }));
  const recipeLinesById = new Map<string, RecipeLine[]>();

  for (const line of recipeLines) {
    const existing = recipeLinesById.get(line.recipeId) ?? [];
    existing.push({
      ingredientId: line.ingredientId,
      quantityOz: line.quantityOz,
    });
    recipeLinesById.set(line.recipeId, existing);
  }

  const menuItems = ((menuItemResult.data ?? []) as MenuItemRow[]).map(
    (row) => ({
      id: row.id,
      name: row.item_name,
      squareItemId: row.square_item_id,
      recipeId: row.recipe_id,
      recipeLines: recipeLinesById.get(row.recipe_id) ?? [],
    }),
  );
  const catalogIsReady = !catalogResult.error;
  const catalogRows = catalogIsReady ? (catalogResult.data ?? []) : [];
  const refreshedTimes = catalogRows
    .map((row) => row.refreshed_at)
    .filter((value): value is string => typeof value === "string")
    .sort();

  return {
    ingredients,
    menuItems,
    catalogVariations: catalogRows.map((row) => ({
      id: row.square_variation_id,
      displayName: row.display_name,
      sku: row.sku ?? "",
    })),
    validationIssues: validationResult.error
      ? localValidation(ingredients, menuItems, catalogIsReady)
      : ((validationResult.data ?? []) as ValidationRow[]).map((row) => ({
        key: row.issue_key,
        severity: row.severity,
        area: row.area,
        entityId: row.entity_id,
        message: row.message,
      })),
    activities: (
      activityResult.error
        ? []
        : (activityResult.data ?? []) as ActivityRow[]
    ).map((row) => ({
        id: row.id,
        action: row.action,
        entityName: row.entity_name ?? "Inventory setup",
        actor: row.changed_by ?? "Owner",
        occurredAt: row.changed_at,
      })),
    catalogRefreshedAt: refreshedTimes.at(-1) ?? null,
  };
}
