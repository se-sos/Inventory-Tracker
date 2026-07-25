import "server-only";

import { createSupabaseAdminClient } from "./supabase";

export type InventoryItem = {
  id: number;
  name: string;
  currentStockOz: number;
  thresholdOz: number | null;
  maxStockOz: number | null;
  gfsCode: string | null;
  packSizeOz: number | null;
  status: "reorder" | "ok" | "not-configured";
  recommendedAddOz: number | null;
};

export type ActivityItem = {
  id: string;
  ingredientName: string;
  description: string;
  actor: string;
  occurredAt: string;
  kind: "adjustment" | "delivery";
};

export type DashboardData = {
  items: InventoryItem[];
  activities: ActivityItem[];
  generatedAt: string;
  lastSquareSyncAt: string | null;
};

type IngredientRow = {
  id: number;
  name: string;
  current_stock_oz: number | string;
  low_stock_threshold_oz: number | string | null;
  max_stock_oz: number | string | null;
  gfs_code: string | null;
  pack_size_oz: number | string | null;
};

function numberOrNull(value: number | string | null): number | null {
  if (value === null) {
    return null;
  }

  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}
function buildInventoryItem(row: IngredientRow): InventoryItem {
  const currentStockOz = Number(row.current_stock_oz);
  const thresholdOz = numberOrNull(row.low_stock_threshold_oz);
  const maxStockOz = numberOrNull(row.max_stock_oz);
  const isConfigured = (
    thresholdOz !== null
    && thresholdOz >= 0
    && maxStockOz !== null
    && maxStockOz > 0
    && thresholdOz <= maxStockOz
  );

  if (!isConfigured) {
    return {
      id: row.id,
      name: row.name,
      currentStockOz,
      thresholdOz,
      maxStockOz,
      gfsCode: row.gfs_code,
      packSizeOz: numberOrNull(row.pack_size_oz),
      status: "not-configured",
      recommendedAddOz: null,
    };
  }

  const needsReorder = currentStockOz <= thresholdOz;

  return {
    id: row.id,
    name: row.name,
    currentStockOz,
    thresholdOz,
    maxStockOz,
    gfsCode: row.gfs_code,
    packSizeOz: numberOrNull(row.pack_size_oz),
    status: needsReorder ? "reorder" : "ok",
    recommendedAddOz: needsReorder
      ? Math.max(0, maxStockOz - currentStockOz)
      : 0,
  };
}

async function loadActiveIngredients(
  supabase: ReturnType<typeof createSupabaseAdminClient>,
) {
  const query = () => supabase
    .from("ingredients")
    .select(
      "id,name,current_stock_oz,low_stock_threshold_oz,max_stock_oz,gfs_code,pack_size_oz",
    );
  const activeResult = await query()
    .eq("is_active", true)
    .order("name");

  if (
    activeResult.error?.code === "42703"
    || activeResult.error?.message.includes("is_active")
  ) {
    return query().order("name");
  }

  return activeResult;
}

export async function getDashboardData(): Promise<DashboardData> {
  const supabase = createSupabaseAdminClient();
  const [
    ingredientResult,
    adjustmentResult,
    receiptResult,
    checkpointResult,
  ] = await Promise.all([
    loadActiveIngredients(supabase),
    supabase
      .from("inventory_adjustments")
      .select(
        "id,ingredient_id,stock_before_oz,stock_after_oz,reason,adjusted_by,adjusted_at",
      )
      .order("adjusted_at", { ascending: false })
      .limit(12),
    supabase
      .from("stock_receipts")
      .select(
        "id,ingredient_id,pack_count,stock_added_oz,stock_after_oz,received_by,received_at",
      )
      .order("received_at", { ascending: false })
      .limit(12),
    supabase.rpc("get_integration_checkpoint", {
      p_name: "square-completed-orders",
    }),
  ]);

  if (ingredientResult.error) {
    throw new Error(
      `Could not load inventory: ${ingredientResult.error.message}`,
    );
  }

  if (adjustmentResult.error) {
    throw new Error(
      `Could not load inventory adjustments: ${adjustmentResult.error.message}`,
    );
  }

  if (receiptResult.error) {
    throw new Error(
      `Could not load stock receipts: ${receiptResult.error.message}`,
    );
  }

  if (checkpointResult.error) {
    throw new Error(
      `Could not load Square sync status: ${checkpointResult.error.message}`,
    );
  }

  const ingredients = (ingredientResult.data ?? []) as IngredientRow[];
  const nameById = new Map(
    ingredients.map((ingredient) => [ingredient.id, ingredient.name]),
  );

  const adjustments: ActivityItem[] = (
    adjustmentResult.data ?? []
  ).map((row) => ({
    id: `adjustment-${row.id}`,
    ingredientName: nameById.get(row.ingredient_id) ?? "Ingredient",
    description: `${Number(row.stock_before_oz).toFixed(1)} → ${Number(row.stock_after_oz).toFixed(1)} oz · ${row.reason}`,
    actor: row.adjusted_by || "Owner",
    occurredAt: row.adjusted_at,
    kind: "adjustment",
  }));

  const receipts: ActivityItem[] = (receiptResult.data ?? []).map((row) => ({
    id: `receipt-${row.id}`,
    ingredientName: nameById.get(row.ingredient_id) ?? "Ingredient",
    description: `Received ${Number(row.pack_count).toFixed(1)} pack(s) · +${Number(row.stock_added_oz).toFixed(1)} oz`,
    actor: row.received_by || "Owner",
    occurredAt: row.received_at,
    kind: "delivery",
  }));

  return {
    items: ingredients
      .map(buildInventoryItem)
      .sort((left, right) => {
        const priority = { reorder: 0, "not-configured": 1, ok: 2 };
        return (
          priority[left.status] - priority[right.status]
          || left.name.localeCompare(right.name)
        );
      }),
    activities: [...adjustments, ...receipts]
      .sort(
        (left, right) => (
          new Date(right.occurredAt).getTime()
          - new Date(left.occurredAt).getTime()
        ),
      )
      .slice(0, 12),
    generatedAt: new Date().toISOString(),
    lastSquareSyncAt: (
      typeof checkpointResult.data === "string"
        ? checkpointResult.data
        : null
    ),
  };
}
