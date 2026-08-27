import assert from "node:assert/strict";
import test from "node:test";
import {
  getDemoDashboardData,
  getDemoOwnerSetupData,
} from "./demo-data.ts";

test("shareable demo data is self-contained and uses sample identifiers", () => {
  const dashboard = getDemoDashboardData();
  const setup = getDemoOwnerSetupData();
  const ingredientIds = new Set(setup.ingredients.map(({ id }) => id));

  assert.ok(dashboard.items.length > 0);
  assert.ok(setup.menuItems.length > 0);
  assert.equal(
    setup.ingredients.every(({ gfsCode }) => gfsCode.startsWith("DEMO-")),
    true,
  );
  assert.equal(
    setup.catalogVariations.every(({ id }) => id.startsWith("demo-square-")),
    true,
  );
  assert.equal(
    setup.menuItems.every(({ recipeLines }) => (
      recipeLines.length > 0
      && recipeLines.every(({ ingredientId, quantityOz }) => (
        ingredientIds.has(ingredientId) && quantityOz > 0
      ))
    )),
    true,
  );
});
