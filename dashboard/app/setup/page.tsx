import Link from "next/link";
import { redirect } from "next/navigation";
import {
  archiveIngredientAction,
  archiveMenuItemAction,
  logoutAction,
  refreshSquareCatalogAction,
  saveIngredientDefinitionAction,
  saveMenuItemAction,
} from "../actions";
import { RecipeEditor } from "./recipe-editor";
import { getDashboardSession } from "@/lib/auth";
import { dashboardWritesAreEnabled } from "@/lib/mutation-mode";
import {
  getOwnerSetupData,
  SetupIngredient,
} from "@/lib/setup-data";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function dateTime(value: string | null): string {
  if (!value) {
    return "Never refreshed";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

function actionLabel(action: string): string {
  return action
    .replaceAll("_", " ")
    .replace(/^\w/, (letter) => letter.toUpperCase());
}

function IngredientFields({
  ingredient,
}: {
  ingredient?: SetupIngredient;
}) {
  return (
    <>
      <input
        name="ingredientId"
        type="hidden"
        value={ingredient?.id ?? ""}
      />
      <div className="form-row">
        <label>
          Ingredient name
          <input
            defaultValue={ingredient?.name}
            name="name"
            placeholder="Example: Whole milk"
            required
          />
        </label>
        <label>
          Current stock (oz)
          <input
            defaultValue={ingredient?.currentStockOz ?? 0}
            min="0"
            name="currentStockOz"
            required
            step="0.01"
            type="number"
          />
        </label>
      </div>
      <div className="form-row three">
        <label>
          Restock threshold (oz)
          <input
            defaultValue={ingredient?.thresholdOz ?? ""}
            min="0"
            name="thresholdOz"
            required
            step="0.01"
            type="number"
          />
        </label>
        <label>
          Maximum capacity (oz)
          <input
            defaultValue={ingredient?.maxStockOz ?? ""}
            min="0.01"
            name="maxStockOz"
            required
            step="0.01"
            type="number"
          />
        </label>
        <label>
          Pack size (oz)
          <input
            defaultValue={ingredient?.packSizeOz ?? ""}
            min="0.01"
            name="packSizeOz"
            placeholder="Optional"
            step="0.01"
            type="number"
          />
        </label>
      </div>
      <label>
        GFS receiving code
        <input
          defaultValue={ingredient?.gfsCode}
          name="gfsCode"
          placeholder="Optional until pack delivery intake is used"
        />
      </label>
      {ingredient && (
        <label>
          Reason for change
          <textarea
            name="reason"
            placeholder="Physical count, new storage capacity, corrected pack size…"
            required
            rows={3}
          />
        </label>
      )}
    </>
  );
}

export default async function SetupPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getDashboardSession();

  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const message = single(params.message);
  const error = single(params.error);
  const readOnly = !dashboardWritesAreEnabled();
  const data = await getOwnerSetupData();
  const validationErrors = data.validationIssues.filter(
    (issue) => issue.severity === "error",
  );
  const validationWarnings = data.validationIssues.filter(
    (issue) => issue.severity === "warning",
  );
  const catalogNameById = new Map(
    data.catalogVariations.map((variation) => [
      variation.id,
      variation.displayName,
    ]),
  );

  return (
    <main className="dashboard-shell setup-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">GC</span>
          <div>
            <p className="eyebrow">Ghost Coffee Roaster</p>
            <h1>Owner setup</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <Link className="secondary-button" href="/">
            Back to dashboard
          </Link>
          <form action={logoutAction}>
            <button className="text-button" type="submit">Sign out</button>
          </form>
        </div>
      </header>

      <section className="intro setup-intro">
        <div>
          <p className="eyebrow">Configuration</p>
          <h2>Keep the inventory model accurate.</h2>
          <p>
            Add ingredients, map food variations from Square, and confirm
            exactly what one completed sale should deduct.
          </p>
        </div>
      </section>

      {message && <div className="notice success">{message}</div>}
      {error && <div className="notice error">{error}</div>}
      {readOnly && (
        <div className="notice info">
          <strong>Read-only demo mode.</strong> Forms and validation are
          visible, but saving, archiving, catalog refreshes, and all live
          database changes are locked.
        </div>
      )}

      <section className="setup-status-grid" aria-label="Setup validation">
        <article className="setup-status-card">
          <span>Active ingredients</span>
          <strong>{data.ingredients.length}</strong>
          <p>Available to use in recipes</p>
        </article>
        <article className="setup-status-card">
          <span>Tracked food items</span>
          <strong>{data.menuItems.length}</strong>
          <p>Mapped to completed Square orders</p>
        </article>
        <article
          className={`setup-status-card ${
            validationErrors.length ? "status-error" : "status-ready"
          }`}
        >
          <span>Blocking errors</span>
          <strong>{validationErrors.length}</strong>
          <p>
            {validationErrors.length
              ? "Resolve these before enabling live deductions"
              : "Configuration passes required checks"}
          </p>
        </article>
        <article className="setup-status-card">
          <span>Warnings</span>
          <strong>{validationWarnings.length}</strong>
          <p>Optional setup that does not block deductions</p>
        </article>
      </section>

      <section className="validation-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Automatic checks</p>
            <h2>Configuration validation</h2>
          </div>
          <span className={`validation-badge ${
            validationErrors.length ? "has-errors" : "ready"
          }`}>
            {validationErrors.length ? "Needs attention" : "Ready"}
          </span>
        </div>
        {data.validationIssues.length ? (
          <ul className="validation-list">
            {data.validationIssues.map((issue) => (
              <li className={issue.severity} key={issue.key}>
                <span>{issue.severity === "error" ? "Error" : "Warning"}</span>
                <p>{issue.message}</p>
              </li>
            ))}
          </ul>
        ) : (
          <div className="validation-clear">
            <strong>All setup checks passed.</strong>
            <p>
              Every active food item has a valid Square mapping and recipe.
            </p>
          </div>
        )}
      </section>

      <section className="setup-section" id="ingredients">
        <div className="section-heading setup-heading">
          <div>
            <p className="eyebrow">Inventory building blocks</p>
            <h2>Ingredients</h2>
          </div>
          <span className="section-count">{data.ingredients.length} active</span>
        </div>

        <details className="setup-create-card">
          <summary>
            <span>
              <strong>Add an ingredient</strong>
              <small>Create stock, reorder, and receiving settings</small>
            </span>
            <span className="summary-action">Open form</span>
          </summary>
          <form
            action={saveIngredientDefinitionAction}
            className="stacked-form setup-form"
          >
            <IngredientFields />
            <div className="form-submit-row">
              <small>
                Threshold must be at or below maximum capacity.
              </small>
              <button
                className="primary-button"
                disabled={readOnly}
                type="submit"
              >
                Add ingredient
              </button>
            </div>
          </form>
        </details>

        <div className="setup-record-list">
          {data.ingredients.map((ingredient) => (
            <details
              className="setup-record"
              id={`ingredient-${ingredient.id}`}
              key={ingredient.id}
            >
              <summary>
                <span>
                  <strong>{ingredient.name}</strong>
                  <small>
                    {ingredient.currentStockOz.toLocaleString()} oz on hand
                    {" · "}
                    threshold {ingredient.thresholdOz.toLocaleString()} oz
                  </small>
                </span>
                <span className="summary-action">Edit</span>
              </summary>
              <div className="record-editor">
                <form
                  action={saveIngredientDefinitionAction}
                  className="stacked-form setup-form"
                >
                  <IngredientFields ingredient={ingredient} />
                  <div className="form-submit-row">
                    <small>
                      Saving here changes the definition and stock estimate.
                    </small>
                    <button
                      className="primary-button"
                      disabled={readOnly}
                      type="submit"
                    >
                      Save ingredient
                    </button>
                  </div>
                </form>
                <details className="archive-panel">
                  <summary>Archive ingredient</summary>
                  <form action={archiveIngredientAction}>
                    <input
                      name="ingredientId"
                      type="hidden"
                      value={ingredient.id}
                    />
                    <p>
                      Archiving preserves history and is blocked while an
                      active menu item still uses this ingredient.
                    </p>
                    <label>
                      Type ARCHIVE to confirm
                      <input name="archiveConfirm" required />
                    </label>
                    <button
                      className="danger-button"
                      disabled={readOnly}
                      type="submit"
                    >
                      Archive ingredient
                    </button>
                  </form>
                </details>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="setup-section" id="menu-items">
        <div className="section-heading setup-heading">
          <div>
            <p className="eyebrow">Square food mapping</p>
            <h2>Menu items and recipes</h2>
          </div>
          <span className="section-count">{data.menuItems.length} tracked</span>
        </div>

        <div className="catalog-bar">
          <div>
            <strong>Square catalog</strong>
            <p>
              Last refreshed {dateTime(data.catalogRefreshedAt)}.
              Refresh only reads Square; it never edits the POS.
            </p>
          </div>
          <form action={refreshSquareCatalogAction}>
            <button
              className="secondary-button"
              disabled={readOnly}
              type="submit"
            >
              Refresh from Square
            </button>
          </form>
        </div>

        <details className="setup-create-card">
          <summary>
            <span>
              <strong>Add a tracked food item</strong>
              <small>Choose its Square variation and build its recipe</small>
            </span>
            <span className="summary-action">Open form</span>
          </summary>
          <form
            action={saveMenuItemAction}
            className="stacked-form setup-form"
          >
            <input name="menuItemId" type="hidden" value="" />
            <label>
              Dashboard name
              <input
                name="itemName"
                placeholder="Example: Turkey pesto sandwich"
                required
              />
            </label>
            <RecipeEditor
              catalogVariations={data.catalogVariations}
              ingredients={data.ingredients}
            />
            <div className="form-submit-row">
              <small>
                New items must come from the latest read-only Square refresh.
              </small>
              <button
                className="primary-button"
                disabled={readOnly}
                type="submit"
              >
                Add tracked item
              </button>
            </div>
          </form>
        </details>

        <div className="setup-record-list">
          {data.menuItems.map((menuItem) => (
            <details
              className="setup-record"
              id={`menu-item-${menuItem.id}`}
              key={menuItem.id}
            >
              <summary>
                <span>
                  <strong>{menuItem.name}</strong>
                  <small>
                    {menuItem.recipeLines.length} ingredient
                    {menuItem.recipeLines.length === 1 ? "" : "s"}
                    {" · "}
                    {catalogNameById.get(menuItem.squareItemId)
                      ?? "Current Square mapping"}
                  </small>
                </span>
                <span className="summary-action">Edit recipe</span>
              </summary>
              <div className="record-editor">
                <form
                  action={saveMenuItemAction}
                  className="stacked-form setup-form"
                >
                  <input
                    name="menuItemId"
                    type="hidden"
                    value={menuItem.id}
                  />
                  <label>
                    Dashboard name
                    <input
                      defaultValue={menuItem.name}
                      name="itemName"
                      required
                    />
                  </label>
                  <RecipeEditor
                    catalogVariations={data.catalogVariations}
                    currentSquareItemId={menuItem.squareItemId}
                    currentSquareLabel={menuItem.name}
                    ingredients={data.ingredients}
                    initialLines={menuItem.recipeLines}
                  />
                  <div className="form-submit-row">
                    <small>
                      The preview shows the exact deduction for one sale.
                    </small>
                    <button
                      className="primary-button"
                      disabled={readOnly}
                      type="submit"
                    >
                      Save recipe
                    </button>
                  </div>
                </form>
                <details className="archive-panel">
                  <summary>Stop tracking this menu item</summary>
                  <form action={archiveMenuItemAction}>
                    <input
                      name="menuItemId"
                      type="hidden"
                      value={menuItem.id}
                    />
                    <p>
                      Future Square orders will ignore this item. Its recipe
                      and history remain saved.
                    </p>
                    <label>
                      Type ARCHIVE to confirm
                      <input name="archiveConfirm" required />
                    </label>
                    <button
                      className="danger-button"
                      disabled={readOnly}
                      type="submit"
                    >
                      Archive menu item
                    </button>
                  </form>
                </details>
              </div>
            </details>
          ))}
        </div>
      </section>

      <section className="setup-section setup-activity-section">
        <div className="section-heading setup-heading">
          <div>
            <p className="eyebrow">Accountability</p>
            <h2>Recent setup changes</h2>
          </div>
        </div>
        {data.activities.length ? (
          <ol className="setup-activity-list">
            {data.activities.map((activity) => (
              <li key={activity.id}>
                <div>
                  <strong>{activity.entityName}</strong>
                  <span>{actionLabel(activity.action)}</span>
                </div>
                <small>
                  {activity.actor} · {dateTime(activity.occurredAt)}
                </small>
              </li>
            ))}
          </ol>
        ) : (
          <p className="muted">No setup changes have been recorded yet.</p>
        )}
      </section>
    </main>
  );
}
