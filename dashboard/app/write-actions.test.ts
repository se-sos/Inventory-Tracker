import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const mutatingActions = [
  "updateIngredientAction",
  "receiveStockAction",
  "saveIngredientDefinitionAction",
  "archiveIngredientAction",
  "saveMenuItemAction",
  "archiveMenuItemAction",
  "refreshSquareCatalogAction",
];

test("every inventory-changing server action checks owner and read-only mode first", async () => {
  const source = await readFile(new URL("./actions.ts", import.meta.url), "utf8");

  for (const [index, actionName] of mutatingActions.entries()) {
    const start = source.indexOf(`export async function ${actionName}`);
    const nextName = mutatingActions[index + 1];
    const nextStart = nextName
      ? source.indexOf(`export async function ${nextName}`, start + 1)
      : source.length;
    const body = source.slice(start, nextStart);
    const ownerCheck = body.indexOf("requireOwner()");
    const writeCheck = body.indexOf("requireWriteMode(");
    const firstExternalOperation = [
      body.indexOf("createSupabaseAdminClient()"),
      body.indexOf("fetchSquareCatalogVariations()"),
    ].filter((position) => position >= 0).sort((a, b) => a - b)[0];

    assert.notEqual(start, -1, `${actionName} is missing`);
    assert.ok(ownerCheck >= 0, `${actionName} must require an owner session`);
    assert.ok(writeCheck > ownerCheck, `${actionName} must check read-only mode`);
    assert.ok(
      firstExternalOperation === undefined || writeCheck < firstExternalOperation,
      `${actionName} must block writes before external data access`,
    );
  }
});
