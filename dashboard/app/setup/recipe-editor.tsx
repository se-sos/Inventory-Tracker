"use client";

import { useMemo, useState } from "react";
import type {
  CatalogVariation,
  RecipeLine,
  SetupIngredient,
} from "@/lib/setup-data";

type EditableLine = RecipeLine & {
  key: string;
};

function newLine(index: number): EditableLine {
  return {
    key: `new-${index}`,
    ingredientId: 0,
    quantityOz: 0,
  };
}

export function RecipeEditor({
  ingredients,
  catalogVariations,
  currentSquareItemId = "",
  currentSquareLabel = "",
  initialLines = [],
}: {
  ingredients: SetupIngredient[];
  catalogVariations: CatalogVariation[];
  currentSquareItemId?: string;
  currentSquareLabel?: string;
  initialLines?: RecipeLine[];
}) {
  const [nextKey, setNextKey] = useState(initialLines.length + 1);
  const [lines, setLines] = useState<EditableLine[]>(
    initialLines.length
      ? initialLines.map((line, index) => ({
        ...line,
        key: `existing-${index}-${line.ingredientId}`,
      }))
      : [newLine(0)],
  );
  const ingredientNames = useMemo(
    () => new Map(
      ingredients.map((ingredient) => [ingredient.id, ingredient.name]),
    ),
    [ingredients],
  );

  function updateLine(
    key: string,
    field: "ingredientId" | "quantityOz",
    value: number,
  ) {
    setLines((current) => current.map((line) => (
      line.key === key ? { ...line, [field]: value } : line
    )));
  }

  function addLine() {
    setLines((current) => [...current, newLine(nextKey)]);
    setNextKey((current) => current + 1);
  }

  function removeLine(key: string) {
    setLines((current) => (
      current.length === 1
        ? current
        : current.filter((line) => line.key !== key)
    ));
  }

  const preview = lines
    .filter((line) => line.ingredientId > 0 && line.quantityOz > 0)
    .map((line) => (
      `${line.quantityOz.toLocaleString("en-US", {
        maximumFractionDigits: 3,
      })} oz ${ingredientNames.get(line.ingredientId) ?? "ingredient"}`
    ));

  return (
    <>
      <label>
        Square menu variation
        <select
          defaultValue={currentSquareItemId}
          name="squareItemId"
          required
        >
          <option value="">Choose from Square</option>
          {currentSquareItemId
            && !catalogVariations.some(
              (variation) => variation.id === currentSquareItemId,
            )
            && (
              <option value={currentSquareItemId}>
                {currentSquareLabel || currentSquareItemId} (current mapping)
              </option>
            )}
          {catalogVariations.map((variation) => (
            <option key={variation.id} value={variation.id}>
              {variation.displayName}
              {variation.sku ? ` · ${variation.sku}` : ""}
            </option>
          ))}
        </select>
      </label>

      <fieldset className="recipe-fieldset">
        <legend>Ingredients used in one sale</legend>
        <div className="recipe-lines">
          {lines.map((line) => (
            <div className="recipe-line" key={line.key}>
              <label>
                <span className="sr-only">Ingredient</span>
                <select
                  name="ingredientId"
                  onChange={(event) => updateLine(
                    line.key,
                    "ingredientId",
                    Number(event.target.value),
                  )}
                  required
                  value={line.ingredientId || ""}
                >
                  <option value="">Choose ingredient</option>
                  {ingredients.map((ingredient) => (
                    <option key={ingredient.id} value={ingredient.id}>
                      {ingredient.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className="amount-field">
                <span className="sr-only">Amount in ounces</span>
                <input
                  min="0.001"
                  name="quantityOz"
                  onChange={(event) => updateLine(
                    line.key,
                    "quantityOz",
                    Number(event.target.value),
                  )}
                  placeholder="Ounces"
                  required
                  step="0.001"
                  type="number"
                  value={line.quantityOz || ""}
                />
                <span>oz</span>
              </label>
              <button
                aria-label="Remove recipe ingredient"
                className="remove-line-button"
                disabled={lines.length === 1}
                onClick={() => removeLine(line.key)}
                type="button"
              >
                Remove
              </button>
            </div>
          ))}
        </div>
        <button
          className="secondary-button add-line-button"
          onClick={addLine}
          type="button"
        >
          Add ingredient
        </button>
      </fieldset>

      <div className="deduction-preview">
        <strong>Validation preview</strong>
        <p>
          {preview.length
            ? `One completed sale will deduct ${preview.join(", ")}.`
            : "Add valid ingredient amounts to preview the deduction."}
        </p>
      </div>
    </>
  );
}
