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
  const labels: Record<string, string> = {
    ingredient_created: "Ingredient added",
    ingredient_updated: "Ingredient updated",
    ingredient_archived: "Ingredient stopped; history kept",
    menu_item_created: "Menu item added",
    menu_item_updated: "Recipe updated",
    menu_item_archived: "Menu item stopped; history kept",
    square_catalog_refreshed: "Square menu refreshed",
  };

  return labels[action] ?? "Setup updated";
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
      <div className="ingredient-form-grid">
        <label className="field-name">
          Ingredient name
          <span className="field-help">Use the name staff already knows.</span>
          <input
            defaultValue={ingredient?.name}
            name="name"
            placeholder="Example: Whole milk"
            required
          />
        </label>
        <label className="field-number">
          On hand
          <span className="field-help">Current ounces.</span>
          <input
            defaultValue={ingredient?.currentStockOz ?? 0}
            min="0"
            name="currentStockOz"
            required
            step="0.01"
            type="number"
          />
        </label>
        <label className="field-number">
          Reorder at
          <span className="field-help">Alert at this many ounces.</span>
          <input
            defaultValue={ingredient?.thresholdOz ?? ""}
            min="0"
            name="thresholdOz"
            required
            step="0.01"
            type="number"
          />
        </label>
        <label className="field-number">
          Fill up to
          <span className="field-help">Maximum storage in ounces.</span>
          <input
            defaultValue={ingredient?.maxStockOz ?? ""}
            min="0.01"
            name="maxStockOz"
            required
            step="0.01"
            type="number"
          />
        </label>
        <label className="field-number">
          Ounces per pack
          <span className="field-help">Optional, for deliveries.</span>
          <input
            defaultValue={ingredient?.packSizeOz ?? ""}
            min="0.01"
            name="packSizeOz"
            placeholder="Optional"
            step="0.01"
            type="number"
          />
        </label>
        <label className="field-code">
          GFS item code
          <span className="field-help">Optional code printed on the case.</span>
          <input
            defaultValue={ingredient?.gfsCode}
            name="gfsCode"
            placeholder="Example: 123456"
          />
        </label>
      </div>
      {ingredient && (
        <label className="field-reason">
          Why are you changing this?
          <span className="field-help">
            This note is saved in recent activity.
          </span>
          <textarea
            name="reason"
            placeholder="Example: Counted stock after closing"
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
            <h1>Inventory setup</h1>
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
          <p className="eyebrow">Owner tools</p>
          <h2>Set up what the store buys and sells.</h2>
          <p>
            Add ingredients, connect food from Square, and tell the dashboard
            what one sale uses.
          </p>
        </div>
      </section>

      {message && (
        <div className="notice success" role="status">
          <strong>Done.</strong> {message}
        </div>
      )}
      {error && (
        <div className="notice error" role="alert">
          <strong>Nothing changed.</strong> {error}
        </div>
      )}
      {readOnly && (
        <div className="notice info" role="status">
          <strong>Safe preview.</strong> You can explore every form, but all
          save, stop, and refresh buttons are locked.
        </div>
      )}

      <section className="setup-guide" aria-labelledby="setup-guide-title">
        <div className="guide-heading">
          <p className="eyebrow">Start here</p>
          <h2 id="setup-guide-title">Three steps to keep inventory accurate</h2>
        </div>
        <ol>
          <li>
            <span>1</span>
            <div>
              <strong>Check ingredients</strong>
              <p>Set what is on hand and when to reorder.</p>
            </div>
          </li>
          <li>
            <span>2</span>
            <div>
              <strong>Check food items</strong>
              <p>Choose the Square item and add its recipe.</p>
            </div>
          </li>
          <li>
            <span>3</span>
            <div>
              <strong>Review the setup check</strong>
              <p>Fix red items first. Yellow items can wait.</p>
            </div>
          </li>
        </ol>
      </section>

      <section className="setup-status-grid" aria-label="Setup summary">
        <article className="setup-status-card">
          <span>Ingredients in use</span>
          <strong>{data.ingredients.length}</strong>
          <p>Ready to add to recipes</p>
        </article>
        <article className="setup-status-card">
          <span>Food items tracked</span>
          <strong>{data.menuItems.length}</strong>
          <p>Connected to food sold in Square</p>
        </article>
        <article
          className={`setup-status-card ${
            validationErrors.length ? "status-error" : "status-ready"
          }`}
        >
          <span>Fix before use</span>
          <strong>{validationErrors.length}</strong>
          <p>
            {validationErrors.length
              ? "These items need your attention"
              : "The required setup looks good"}
          </p>
        </article>
        <article className="setup-status-card">
          <span>Finish later</span>
          <strong>{validationWarnings.length}</strong>
          <p>Helpful details that do not block use</p>
        </article>
      </section>

      <section className="validation-panel">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Automatic review</p>
            <h2>Setup check</h2>
          </div>
          <span className={`validation-badge ${
            validationErrors.length ? "has-errors" : "ready"
          }`}>
            {validationErrors.length ? "Needs attention" : "Ready"}
          </span>
        </div>
        {data.validationIssues.length ? (
          <div className="validation-groups">
            {validationErrors.length > 0 && (
              <div>
                <h3>Fix these before going live</h3>
                <ul className="validation-list">
                  {validationErrors.map((issue) => (
                    <li className="error" key={issue.key}>
                      <span>Fix</span>
                      <p>{issue.message}</p>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {validationWarnings.length > 0 && (
              <details className="warning-details">
                <summary>
                  <span>
                    <strong>{validationWarnings.length} things to finish later</strong>
                    <small>These will not stop the dashboard from working.</small>
                  </span>
                  <span className="summary-action">Show list</span>
                </summary>
                <ul className="validation-list">
                  {validationWarnings.map((issue) => (
                    <li className="warning" key={issue.key}>
                      <span>Later</span>
                      <p>{issue.message}</p>
                    </li>
                  ))}
                </ul>
              </details>
            )}
          </div>
        ) : (
          <div className="validation-clear">
            <strong>All setup checks passed.</strong>
            <p>
              Every food item is connected to Square and has a complete recipe.
            </p>
          </div>
        )}
      </section>

      <section className="setup-section" id="ingredients">
        <div className="section-heading setup-heading">
          <div>
            <p className="eyebrow">Stock ingredients</p>
            <h2>Ingredients</h2>
            <p className="section-help">
              Open any ingredient to change its stock or reorder settings.
            </p>
          </div>
          <span className="section-count">{data.ingredients.length} active</span>
        </div>

        <details className="setup-create-card">
          <summary>
            <span>
              <strong>Add an ingredient</strong>
              <small>Enter its stock amount and reorder point</small>
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
                “Reorder at” cannot be higher than “Fill up to.”
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

        {data.ingredients.length ? (
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
                    reorder at {ingredient.thresholdOz.toLocaleString()} oz
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
                      Your note and changes are saved in recent activity.
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
                  <summary>Advanced: stop using this ingredient</summary>
                  <form action={archiveIngredientAction}>
                    <input
                      name="ingredientId"
                      type="hidden"
                      value={ingredient.id}
                    />
                    <p>
                      This hides the ingredient from daily work but keeps its
                      history. You must remove it from active recipes first.
                    </p>
                    <label>
                      Type STOP to confirm
                      <input
                        autoComplete="off"
                        name="archiveConfirm"
                        required
                      />
                    </label>
                    <button
                      className="danger-button"
                      disabled={readOnly}
                      type="submit"
                    >
                      Stop using ingredient
                    </button>
                  </form>
                </details>
              </div>
            </details>
            ))}
          </div>
        ) : (
          <div className="empty-guidance">
            <strong>No ingredients yet.</strong>
            <p>Add the first ingredient to begin building recipes.</p>
          </div>
        )}
      </section>

      <section className="setup-section" id="menu-items">
        <div className="section-heading setup-heading">
          <div>
            <p className="eyebrow">Food sold in Square</p>
            <h2>Menu items and recipes</h2>
            <p className="section-help">
              Open an item to review exactly what one sale removes from stock.
            </p>
          </div>
          <span className="section-count">{data.menuItems.length} tracked</span>
        </div>

        <div className="catalog-bar">
          <div>
            <strong>Square menu</strong>
            <p>
              Last refreshed {dateTime(data.catalogRefreshedAt)}.
              Refreshing only reads the menu and never changes the register.
            </p>
            {!data.catalogVariations.length && (
              <small>
                Load the Square menu before adding a new food item.
              </small>
            )}
          </div>
          <form action={refreshSquareCatalogAction}>
            <button
              className="secondary-button"
              disabled={readOnly}
              type="submit"
            >
              Refresh Square menu
            </button>
          </form>
        </div>

        <details className="setup-create-card">
          <summary>
            <span>
              <strong>Add a food item</strong>
              <small>Choose it from Square, then add its ingredients</small>
            </span>
            <span className="summary-action">Open form</span>
          </summary>
          <form
            action={saveMenuItemAction}
            className="stacked-form setup-form"
          >
            <input name="menuItemId" type="hidden" value="" />
            <label className="field-name">
              Name shown here
              <span className="field-help">
                Use the same name employees see in Square.
              </span>
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
                Refresh the Square menu first if the item is missing.
              </small>
              <button
                className="primary-button"
                disabled={readOnly}
                type="submit"
              >
                Add food item
              </button>
            </div>
          </form>
        </details>

        {data.menuItems.length ? (
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
                      ?? "Saved Square item"}
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
                  <label className="field-name">
                    Name shown here
                    <span className="field-help">
                      This is the name the owner sees in the dashboard.
                    </span>
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
                      Review the “one sale” box before saving.
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
                  <summary>Advanced: stop tracking this food item</summary>
                  <form action={archiveMenuItemAction}>
                    <input
                      name="menuItemId"
                      type="hidden"
                      value={menuItem.id}
                    />
                    <p>
                      Future sales will no longer change inventory for this
                      item. Its recipe and history stay saved.
                    </p>
                    <label>
                      Type STOP to confirm
                      <input
                        autoComplete="off"
                        name="archiveConfirm"
                        required
                      />
                    </label>
                    <button
                      className="danger-button"
                      disabled={readOnly}
                      type="submit"
                    >
                      Stop tracking food item
                    </button>
                  </form>
                </details>
              </div>
            </details>
            ))}
          </div>
        ) : (
          <div className="empty-guidance">
            <strong>No food items yet.</strong>
            <p>Refresh the Square menu, then add the first food item.</p>
          </div>
        )}
      </section>

      <section className="setup-section setup-activity-section">
        <div className="section-heading setup-heading">
          <div>
            <p className="eyebrow">Change history</p>
            <h2>Recent changes</h2>
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
          <div className="empty-guidance compact">
            <strong>No changes yet.</strong>
            <p>Saved edits will appear here with who made them and when.</p>
          </div>
        )}
      </section>
    </main>
  );
}
