"use server";

import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import {
  clearDashboardSession,
  createDashboardSession,
  getDashboardSession,
  verifyDashboardCredentials,
} from "@/lib/auth";
import { createSupabaseAdminClient } from "@/lib/supabase";
import { fetchSquareCatalogVariations } from "@/lib/square-catalog";
import { dashboardWritesAreEnabled } from "@/lib/mutation-mode";

function formText(formData: FormData, name: string): string {
  return String(formData.get(name) ?? "").trim();
}
function formNumber(formData: FormData, name: string): number {
  const value = Number(formText(formData, name));

  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`);
  }

  return value;
}

function formOptionalNumber(
  formData: FormData,
  name: string,
): number | null {
  const raw = formText(formData, name);

  if (!raw) {
    return null;
  }

  const value = Number(raw);

  if (!Number.isFinite(value)) {
    throw new Error(`${name} must be a number`);
  }

  return value;
}

async function requireOwner() {
  const session = await getDashboardSession();

  if (!session) {
    redirect("/login");
  }

  return session;
}

function errorRedirect(message: string): never {
  redirect(`/?error=${encodeURIComponent(message)}`);
}

function setupRedirect(
  kind: "error" | "message",
  message: string,
  anchor = "",
): never {
  redirect(
    `/setup?${kind}=${encodeURIComponent(message)}${anchor}`,
  );
}

function requireWriteMode(area: "dashboard" | "setup") {
  if (dashboardWritesAreEnabled()) {
    return;
  }

  const message = encodeURIComponent(
    "Read-only demo mode is on. No live data was changed.",
  );

  if (area === "setup") {
    redirect(`/setup?error=${message}`);
  }

  redirect(`/?error=${message}`);
}

export async function loginAction(formData: FormData) {
  const email = formText(formData, "email");
  const password = formText(formData, "password");
  let credentialsAreValid: boolean;

  try {
    credentialsAreValid = verifyDashboardCredentials(email, password);
  } catch {
    redirect(
      "/login?error=The%20dashboard%20login%20has%20not%20been%20configured",
    );
  }

  if (!credentialsAreValid) {
    redirect("/login?error=Invalid%20email%20or%20password");
  }

  await createDashboardSession(email);
  redirect("/");
}

export async function logoutAction() {
  await clearDashboardSession();
  redirect("/login");
}

export async function updateIngredientAction(formData: FormData) {
  const session = await requireOwner();
  requireWriteMode("dashboard");
  const ingredientId = formNumber(formData, "ingredientId");
  const currentStockOz = formNumber(formData, "currentStockOz");
  const thresholdOz = formNumber(formData, "thresholdOz");
  const maxStockOz = formNumber(formData, "maxStockOz");
  const reason = formText(formData, "reason");

  if (!Number.isInteger(ingredientId) || ingredientId <= 0) {
    errorRedirect("Invalid ingredient");
  }

  if (currentStockOz < 0 || thresholdOz < 0 || maxStockOz <= 0) {
    errorRedirect("Stock values cannot be negative");
  }

  if (thresholdOz > maxStockOz) {
    errorRedirect("The threshold cannot exceed maximum stock");
  }

  if (!reason) {
    errorRedirect("A reason is required");
  }

  const { error } = await createSupabaseAdminClient().rpc(
    "update_ingredient_inventory_settings",
    {
      p_ingredient_id: ingredientId,
      p_current_stock_oz: currentStockOz,
      p_low_stock_threshold_oz: thresholdOz,
      p_max_stock_oz: maxStockOz,
      p_reason: reason,
      p_adjusted_by: session.email,
    },
  );

  if (error) {
    console.error("[inventory-update] Supabase update failed", error);
    errorRedirect("Inventory update failed. Please try again.");
  }

  revalidatePath("/");
  redirect("/?message=Inventory%20updated");
}

export async function receiveStockAction(formData: FormData) {
  const session = await requireOwner();
  requireWriteMode("dashboard");
  const gfsCode = formText(formData, "gfsCode");
  const packCount = formNumber(formData, "packCount");

  if (!gfsCode) {
    errorRedirect("Choose an ingredient");
  }

  if (packCount <= 0) {
    errorRedirect("Pack count must be greater than zero");
  }

  const { error } = await createSupabaseAdminClient().rpc(
    "receive_stock_delivery",
    {
      p_gfs_code: gfsCode,
      p_pack_count: packCount,
      p_received_by: session.email,
    },
  );

  if (error) {
    console.error("[stock-delivery] Supabase delivery failed", error);
    errorRedirect("Delivery could not be recorded. Please try again.");
  }

  revalidatePath("/");
  redirect("/?message=Delivery%20recorded");
}

export async function saveIngredientDefinitionAction(
  formData: FormData,
) {
  const session = await requireOwner();
  requireWriteMode("setup");
  const rawIngredientId = formText(formData, "ingredientId");
  const ingredientId = rawIngredientId
    ? Number(rawIngredientId)
    : null;
  const name = formText(formData, "name");
  const currentStockOz = formNumber(formData, "currentStockOz");
  const thresholdOz = formNumber(formData, "thresholdOz");
  const maxStockOz = formNumber(formData, "maxStockOz");
  const gfsCode = formText(formData, "gfsCode");
  const packSizeOz = formOptionalNumber(formData, "packSizeOz");
  const reason = formText(formData, "reason");

  if (
    ingredientId !== null
    && (!Number.isInteger(ingredientId) || ingredientId <= 0)
  ) {
    setupRedirect("error", "Invalid ingredient", "#ingredients");
  }

  if (!name) {
    setupRedirect("error", "Ingredient name is required", "#ingredients");
  }

  if (
    currentStockOz < 0
    || thresholdOz < 0
    || maxStockOz <= 0
    || (packSizeOz !== null && packSizeOz <= 0)
  ) {
    setupRedirect(
      "error",
      "Stock, threshold, maximum, or pack size is invalid",
      "#ingredients",
    );
  }

  if (thresholdOz > maxStockOz) {
    setupRedirect(
      "error",
      "The threshold cannot exceed maximum stock",
      "#ingredients",
    );
  }

  if (ingredientId !== null && !reason) {
    setupRedirect(
      "error",
      "A reason is required when updating an ingredient",
      "#ingredients",
    );
  }

  const { error } = await createSupabaseAdminClient().rpc(
    "save_owner_ingredient",
    {
      p_ingredient_id: ingredientId,
      p_name: name,
      p_current_stock_oz: currentStockOz,
      p_low_stock_threshold_oz: thresholdOz,
      p_max_stock_oz: maxStockOz,
      p_gfs_code: gfsCode || null,
      p_pack_size_oz: packSizeOz,
      p_reason: reason || null,
      p_changed_by: session.email,
    },
  );

  if (error) {
    console.error("[owner-setup] Ingredient save failed", error);
    setupRedirect(
      "error",
      "Ingredient could not be saved. Check for duplicate names or GFS codes.",
      "#ingredients",
    );
  }

  revalidatePath("/");
  revalidatePath("/setup");
  setupRedirect(
    "message",
    ingredientId ? "Ingredient updated" : "Ingredient added",
    "#ingredients",
  );
}

export async function archiveIngredientAction(formData: FormData) {
  const session = await requireOwner();
  requireWriteMode("setup");
  const ingredientId = formNumber(formData, "ingredientId");
  const confirmation = formText(formData, "archiveConfirm");

  if (
    !Number.isInteger(ingredientId)
    || ingredientId <= 0
    || confirmation !== "ARCHIVE"
  ) {
    setupRedirect(
      "error",
      "Type ARCHIVE to confirm",
      "#ingredients",
    );
  }

  const { error } = await createSupabaseAdminClient().rpc(
    "archive_owner_ingredient",
    {
      p_ingredient_id: ingredientId,
      p_changed_by: session.email,
    },
  );

  if (error) {
    console.error("[owner-setup] Ingredient archive failed", error);
    setupRedirect(
      "error",
      "That ingredient is still used by an active menu item.",
      "#ingredients",
    );
  }

  revalidatePath("/");
  revalidatePath("/setup");
  setupRedirect("message", "Ingredient archived", "#ingredients");
}

export async function saveMenuItemAction(formData: FormData) {
  const session = await requireOwner();
  requireWriteMode("setup");
  const rawMenuItemId = formText(formData, "menuItemId");
  const menuItemId = rawMenuItemId ? Number(rawMenuItemId) : null;
  const itemName = formText(formData, "itemName");
  const squareItemId = formText(formData, "squareItemId");
  const ingredientIds = formData.getAll("ingredientId").map(Number);
  const quantities = formData.getAll("quantityOz").map(Number);

  if (
    menuItemId !== null
    && (!Number.isInteger(menuItemId) || menuItemId <= 0)
  ) {
    setupRedirect("error", "Invalid menu item", "#menu-items");
  }

  if (!itemName || !squareItemId) {
    setupRedirect(
      "error",
      "Menu name and Square variation are required",
      "#menu-items",
    );
  }

  if (
    ingredientIds.length === 0
    || ingredientIds.length !== quantities.length
    || ingredientIds.some(
      (ingredientId) => (
        !Number.isInteger(ingredientId) || ingredientId <= 0
      ),
    )
    || quantities.some(
      (quantity) => !Number.isFinite(quantity) || quantity <= 0,
    )
    || new Set(ingredientIds).size !== ingredientIds.length
  ) {
    setupRedirect(
      "error",
      "Every recipe row needs one unique ingredient and a positive amount",
      "#menu-items",
    );
  }

  const recipeLines = ingredientIds.map((ingredientId, index) => ({
    ingredient_id: ingredientId,
    quantity_required_oz: quantities[index],
  }));
  const { error } = await createSupabaseAdminClient().rpc(
    "save_owner_menu_item",
    {
      p_menu_item_id: menuItemId,
      p_item_name: itemName,
      p_square_item_id: squareItemId,
      p_recipe_lines: recipeLines,
      p_changed_by: session.email,
    },
  );

  if (error) {
    console.error("[owner-setup] Menu item save failed", error);
    setupRedirect(
      "error",
      "Menu item could not be saved. Refresh Square and check the recipe.",
      "#menu-items",
    );
  }

  revalidatePath("/setup");
  setupRedirect(
    "message",
    menuItemId ? "Menu item updated" : "Menu item added",
    "#menu-items",
  );
}

export async function archiveMenuItemAction(formData: FormData) {
  const session = await requireOwner();
  requireWriteMode("setup");
  const menuItemId = formNumber(formData, "menuItemId");
  const confirmation = formText(formData, "archiveConfirm");

  if (
    !Number.isInteger(menuItemId)
    || menuItemId <= 0
    || confirmation !== "ARCHIVE"
  ) {
    setupRedirect(
      "error",
      "Type ARCHIVE to confirm",
      "#menu-items",
    );
  }

  const { error } = await createSupabaseAdminClient().rpc(
    "archive_owner_menu_item",
    {
      p_menu_item_id: menuItemId,
      p_changed_by: session.email,
    },
  );

  if (error) {
    console.error("[owner-setup] Menu item archive failed", error);
    setupRedirect(
      "error",
      "Menu item could not be archived",
      "#menu-items",
    );
  }

  revalidatePath("/setup");
  setupRedirect("message", "Menu item archived", "#menu-items");
}

export async function refreshSquareCatalogAction() {
  const session = await requireOwner();
  requireWriteMode("setup");
  let variations;

  try {
    variations = await fetchSquareCatalogVariations();
  } catch (error) {
    console.error("[owner-setup] Square catalog read failed", error);
    setupRedirect(
      "error",
      "Square catalog could not be refreshed. Check the Pi connection.",
      "#menu-items",
    );
  }

  const { data, error } = await createSupabaseAdminClient().rpc(
    "replace_square_catalog_cache",
    {
      p_variations: variations,
      p_changed_by: session.email,
    },
  );

  if (error) {
    console.error("[owner-setup] Square catalog cache failed", error);
    setupRedirect(
      "error",
      "Square catalog could not be saved",
      "#menu-items",
    );
  }

  revalidatePath("/setup");
  setupRedirect(
    "message",
    `Square catalog refreshed with ${Number(data)} variations`,
    "#menu-items",
  );
}
