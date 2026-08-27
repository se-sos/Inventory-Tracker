import type { DashboardData } from "./dashboard-data";
import type { OwnerSetupData } from "./setup-data";

function minutesAgo(minutes: number): string {
  return new Date(Date.now() - minutes * 60_000).toISOString();
}

export function getDemoDashboardData(): DashboardData {
  return {
    items: [
      {
        id: 1,
        name: "Espresso Beans",
        currentStockOz: 72,
        thresholdOz: 80,
        maxStockOz: 240,
        gfsCode: "DEMO-001",
        packSizeOz: 80,
        status: "reorder",
        recommendedAddOz: 168,
      },
      {
        id: 2,
        name: "Chicken Breast",
        currentStockOz: 38,
        thresholdOz: 48,
        maxStockOz: 160,
        gfsCode: "DEMO-002",
        packSizeOz: 40,
        status: "reorder",
        recommendedAddOz: 122,
      },
      {
        id: 3,
        name: "Avocado",
        currentStockOz: 20,
        thresholdOz: 24,
        maxStockOz: 80,
        gfsCode: "DEMO-003",
        packSizeOz: 32,
        status: "reorder",
        recommendedAddOz: 60,
      },
      {
        id: 8,
        name: "Chipotle Mayo",
        currentStockOz: 18,
        thresholdOz: 20,
        maxStockOz: 64,
        gfsCode: "DEMO-008",
        packSizeOz: 32,
        status: "reorder",
        recommendedAddOz: 46,
      },
      {
        id: 4,
        name: "Bacon",
        currentStockOz: 64,
        thresholdOz: 40,
        maxStockOz: 120,
        gfsCode: "DEMO-004",
        packSizeOz: 40,
        status: "ok",
        recommendedAddOz: 0,
      },
      {
        id: 5,
        name: "Eggs",
        currentStockOz: 96,
        thresholdOz: 48,
        maxStockOz: 144,
        gfsCode: "DEMO-005",
        packSizeOz: 48,
        status: "ok",
        recommendedAddOz: 0,
      },
      {
        id: 6,
        name: "Cheddar Cheese",
        currentStockOz: 42,
        thresholdOz: 32,
        maxStockOz: 96,
        gfsCode: "DEMO-006",
        packSizeOz: 32,
        status: "ok",
        recommendedAddOz: 0,
      },
      {
        id: 7,
        name: "Sourdough Bread",
        currentStockOz: 55,
        thresholdOz: 30,
        maxStockOz: 90,
        gfsCode: "DEMO-007",
        packSizeOz: 30,
        status: "ok",
        recommendedAddOz: 0,
      },
    ],
    activities: [
      {
        id: "demo-delivery-1",
        ingredientName: "Eggs",
        description: "Received 2.0 pack(s) · +96.0 oz",
        actor: "Demo owner",
        occurredAt: minutesAgo(45),
        kind: "delivery",
      },
      {
        id: "demo-adjustment-1",
        ingredientName: "Avocado",
        description: "24.0 → 20.0 oz · Closing count",
        actor: "Demo owner",
        occurredAt: minutesAgo(180),
        kind: "adjustment",
      },
      {
        id: "demo-adjustment-2",
        ingredientName: "Espresso Beans",
        description: "80.0 → 72.0 oz · Sample completed sales",
        actor: "Demo system",
        occurredAt: minutesAgo(360),
        kind: "adjustment",
      },
    ],
    generatedAt: new Date().toISOString(),
    lastSquareSyncAt: minutesAgo(15),
  };
}

export function getDemoOwnerSetupData(): OwnerSetupData {
  const dashboard = getDemoDashboardData();

  return {
    ingredients: dashboard.items.map((item) => ({
      id: item.id,
      name: item.name,
      currentStockOz: item.currentStockOz,
      thresholdOz: item.thresholdOz ?? 0,
      maxStockOz: item.maxStockOz ?? 0,
      gfsCode: item.gfsCode ?? "",
      packSizeOz: item.packSizeOz,
    })),
    menuItems: [
      {
        id: 101,
        name: "Breakfast Sandwich",
        squareItemId: "demo-square-breakfast-sandwich",
        recipeId: "demo-recipe-breakfast-sandwich",
        recipeLines: [
          { ingredientId: 5, quantityOz: 4 },
          { ingredientId: 4, quantityOz: 2 },
          { ingredientId: 6, quantityOz: 1 },
          { ingredientId: 7, quantityOz: 3 },
        ],
      },
      {
        id: 102,
        name: "Chicken Avocado Wrap",
        squareItemId: "demo-square-chicken-avocado-wrap",
        recipeId: "demo-recipe-chicken-avocado-wrap",
        recipeLines: [
          { ingredientId: 2, quantityOz: 5 },
          { ingredientId: 3, quantityOz: 2.5 },
          { ingredientId: 8, quantityOz: 0.8 },
        ],
      },
      {
        id: 103,
        name: "Avocado Toast",
        squareItemId: "demo-square-avocado-toast",
        recipeId: "demo-recipe-avocado-toast",
        recipeLines: [
          { ingredientId: 3, quantityOz: 3 },
          { ingredientId: 7, quantityOz: 2.8 },
          { ingredientId: 5, quantityOz: 2 },
        ],
      },
    ],
    catalogVariations: [
      {
        id: "demo-square-breakfast-sandwich",
        displayName: "Breakfast Sandwich",
        sku: "DEMO-BREAKFAST",
      },
      {
        id: "demo-square-chicken-avocado-wrap",
        displayName: "Chicken Avocado Wrap",
        sku: "DEMO-WRAP",
      },
      {
        id: "demo-square-avocado-toast",
        displayName: "Avocado Toast",
        sku: "DEMO-TOAST",
      },
    ],
    validationIssues: [
      {
        key: "demo-pack-check-avocado",
        severity: "warning",
        area: "ingredient",
        entityId: "3",
        message: "Confirm the supplier pack size for Avocado before launch.",
      },
    ],
    activities: [
      {
        id: "demo-setup-1",
        action: "menu_item_updated",
        entityName: "Chicken Avocado Wrap",
        actor: "Demo owner",
        occurredAt: minutesAgo(120),
      },
      {
        id: "demo-setup-2",
        action: "ingredient_updated",
        entityName: "Espresso Beans",
        actor: "Demo owner",
        occurredAt: minutesAgo(300),
      },
      {
        id: "demo-setup-3",
        action: "square_catalog_refreshed",
        entityName: "Sample Square menu",
        actor: "Demo system",
        occurredAt: minutesAgo(15),
      },
    ],
    catalogRefreshedAt: minutesAgo(15),
  };
}
