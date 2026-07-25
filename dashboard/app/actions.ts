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
