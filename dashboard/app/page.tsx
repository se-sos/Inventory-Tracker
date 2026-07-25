import { redirect } from "next/navigation";
import Link from "next/link";
import {
  logoutAction,
  receiveStockAction,
  updateIngredientAction,
} from "./actions";
import { getDashboardSession } from "@/lib/auth";
import {
  getDashboardData,
  InventoryItem,
} from "@/lib/dashboard-data";

export const dynamic = "force-dynamic";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

function single(
  value: string | string[] | undefined,
): string | undefined {
  return Array.isArray(value) ? value[0] : value;
}

function ounces(value: number | null): string {
  if (value === null) {
    return "Not set";
  }

  return `${value.toLocaleString("en-US", {
    maximumFractionDigits: 1,
  })} oz`;
}

function dateTime(value: string | null): string {
  if (!value) {
    return "Not started";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
    timeZone: "America/New_York",
  }).format(new Date(value));
}

function statusLabel(item: InventoryItem): string {
  if (item.status === "reorder") {
    return "Reorder";
  }

  if (item.status === "not-configured") {
    return "Set up";
  }

  return "Healthy";
}

export default async function Home({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  const session = await getDashboardSession();

  if (!session) {
    redirect("/login");
  }

  const params = await searchParams;
  const query = single(params.q)?.trim().toLowerCase() ?? "";
  const filter = single(params.filter) ?? "all";
  const editId = Number(single(params.edit));
  const message = single(params.message);
  const error = single(params.error);
  const data = await getDashboardData();

  const reorderItems = data.items.filter(
    (item) => item.status === "reorder",
  );
  const configuredItems = data.items.filter(
    (item) => item.status !== "not-configured",
  );
  const healthyCount = data.items.filter(
    (item) => item.status === "ok",
  ).length;
  const healthPercent = configuredItems.length
    ? Math.round((healthyCount / configuredItems.length) * 100)
    : 0;
  const filteredItems = data.items.filter((item) => {
    const matchesQuery = item.name.toLowerCase().includes(query);
    const matchesFilter = (
      filter === "all"
      || item.status === filter
    );

    return matchesQuery && matchesFilter;
  });
  const editingItem = data.items.find((item) => item.id === editId);
  const receivingItems = data.items.filter(
    (item) => item.gfsCode && item.packSizeOz && item.packSizeOz > 0,
  );

  return (
    <main className="dashboard-shell">
      <header className="topbar">
        <div className="brand">
          <span className="brand-mark">GC</span>
          <div>
            <p className="eyebrow">Ghost Coffee Roaster</p>
            <h1>Inventory control</h1>
          </div>
        </div>
        <div className="topbar-actions">
          <div className="sync-copy">
            <span className="sync-dot" aria-hidden="true" />
            <span>
              <small>Last Square update</small>
              <strong>{dateTime(data.lastSquareSyncAt)}</strong>
            </span>
          </div>
          <form action={logoutAction}>
            <button className="text-button" type="submit">Sign out</button>
          </form>
        </div>
      </header>

      <section className="intro">
        <div>
          <p className="eyebrow">Owner overview</p>
          <h2>Know what needs attention before service.</h2>
          <p>
            Estimated ingredient levels based on recorded deliveries,
            physical counts, and completed Square food orders.
          </p>
        </div>
        <p className="updated">
          Refreshed {dateTime(data.generatedAt)}
        </p>
      </section>

      {message && <div className="notice success">{message}</div>}
      {error && <div className="notice error">{error}</div>}

      <section className="metric-grid" aria-label="Inventory summary">
        <article className="metric-card metric-primary">
          <span>Needs reorder</span>
          <strong>{reorderItems.length}</strong>
          <p>
            {reorderItems.length
              ? `${reorderItems.slice(0, 2).map((item) => item.name).join(", ")}${reorderItems.length > 2 ? ` +${reorderItems.length - 2} more` : ""}`
              : "Nothing is below its threshold"}
          </p>
        </article>
        <article className="metric-card">
          <span>Inventory health</span>
          <strong>{healthPercent}%</strong>
          <div className="health-track" aria-hidden="true">
            <span style={{ width: `${healthPercent}%` }} />
          </div>
          <p>{healthyCount} configured ingredients are healthy</p>
        </article>
        <article className="metric-card">
          <span>Tracked ingredients</span>
          <strong>{data.items.length}</strong>
          <p>
            {data.items.length - configuredItems.length} still need
            threshold or capacity settings
          </p>
        </article>
      </section>

      <section className="priority-section">
        <div className="section-heading">
          <div>
            <p className="eyebrow">Priority list</p>
            <h2>Reorder recommendations</h2>
          </div>
          <a className="secondary-button" href="#all-inventory">
            View all inventory
          </a>
        </div>

        {reorderItems.length ? (
          <div className="reorder-grid">
            {reorderItems.map((item) => (
              <article className="reorder-card" key={item.id}>
                <div className="reorder-top">
                  <span className="status-pill reorder">Reorder</span>
                  <a
                    className="edit-link"
                    href={`/?edit=${item.id}#all-inventory`}
                  >
                    Update
                  </a>
                </div>
                <h3>{item.name}</h3>
                <div className="stock-reading">
                  <strong>{ounces(item.currentStockOz)}</strong>
                  <span>on hand</span>
                </div>
                <dl>
                  <div>
                    <dt>Threshold</dt>
                    <dd>{ounces(item.thresholdOz)}</dd>
                  </div>
                  <div>
                    <dt>Suggested order</dt>
                    <dd>{ounces(item.recommendedAddOz)}</dd>
                  </div>
                </dl>
              </article>
            ))}
          </div>
        ) : (
          <div className="empty-state">
            <span>All clear</span>
            <p>No configured ingredients are below their thresholds.</p>
          </div>
        )}
      </section>

      <section className="content-grid" id="all-inventory">
        <div className="inventory-panel">
          <div className="section-heading table-heading">
            <div>
              <p className="eyebrow">Complete list</p>
              <h2>All inventory</h2>
            </div>
            <form className="inventory-tools">
              <input
                aria-label="Search ingredients"
                defaultValue={single(params.q)}
                name="q"
                placeholder="Search ingredients"
                type="search"
              />
              <select
                aria-label="Filter inventory"
                defaultValue={filter}
                name="filter"
              >
                <option value="all">All status</option>
                <option value="reorder">Reorder</option>
                <option value="ok">Healthy</option>
                <option value="not-configured">Needs setup</option>
              </select>
              <button className="compact-button" type="submit">Apply</button>
            </form>
          </div>

          <div className="inventory-table-wrap">
            <table className="inventory-table">
              <thead>
                <tr>
                  <th>Ingredient</th>
                  <th>Status</th>
                  <th>Current</th>
                  <th>Threshold</th>
                  <th>Maximum</th>
                  <th><span className="sr-only">Actions</span></th>
                </tr>
              </thead>
              <tbody>
                {filteredItems.map((item) => (
                  <tr key={item.id}>
                    <td>
                      <strong>{item.name}</strong>
                      {item.packSizeOz && (
                        <small>{ounces(item.packSizeOz)} per pack</small>
                      )}
                    </td>
                    <td>
                      <span className={`status-pill ${item.status}`}>
                        {statusLabel(item)}
                      </span>
                    </td>
                    <td>{ounces(item.currentStockOz)}</td>
                    <td>{ounces(item.thresholdOz)}</td>
                    <td>{ounces(item.maxStockOz)}</td>
                    <td>
                      <a
                        className="row-action"
                        href={`/?q=${encodeURIComponent(query)}&filter=${encodeURIComponent(filter)}&edit=${item.id}#all-inventory`}
                      >
                        Edit
                      </a>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          {!filteredItems.length && (
            <p className="no-results">No ingredients match those filters.</p>
          )}
        </div>

        <aside className="side-column">
          <section className="receive-card">
            <p className="eyebrow">Stock intake</p>
            <h2>Record a delivery</h2>
            <p>Add received packs using the saved GFS pack size.</p>
            <form action={receiveStockAction} className="stacked-form">
              <label>
                Ingredient
                <select name="gfsCode" required>
                  <option value="">Choose ingredient</option>
                  {receivingItems.map((item) => (
                    <option key={item.id} value={item.gfsCode ?? ""}>
                      {item.name} · {ounces(item.packSizeOz)}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Packs received
                <input
                  min="0.01"
                  name="packCount"
                  required
                  step="0.01"
                  type="number"
                />
              </label>
              <button className="primary-button" type="submit">
                Record delivery
              </button>
            </form>
            {receivingItems.length < data.items.length && (
              <small className="form-note">
                {data.items.length - receivingItems.length} ingredients need
                GFS and pack-size settings before delivery intake is available.
              </small>
            )}
          </section>

          <section className="activity-card">
            <div className="section-heading">
              <div>
                <p className="eyebrow">Audit trail</p>
                <h2>Recent activity</h2>
              </div>
            </div>
            {data.activities.length ? (
              <ol className="activity-list">
                {data.activities.map((activity) => (
                  <li key={activity.id}>
                    <span className={`activity-mark ${activity.kind}`} />
                    <div>
                      <strong>{activity.ingredientName}</strong>
                      <p>{activity.description}</p>
                      <small>
                        {activity.actor} · {dateTime(activity.occurredAt)}
                      </small>
                    </div>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="muted">No owner activity recorded yet.</p>
            )}
          </section>
        </aside>
      </section>

      {editingItem && (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="edit-title"
            aria-modal="true"
            className="edit-modal"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Inventory correction</p>
                <h2 id="edit-title">{editingItem.name}</h2>
              </div>
              <Link className="modal-close" href="/#all-inventory" aria-label="Close">
                ×
              </Link>
            </div>
            <form action={updateIngredientAction} className="stacked-form">
              <input
                name="ingredientId"
                type="hidden"
                value={editingItem.id}
              />
              <div className="form-row">
                <label>
                  Current stock (oz)
                  <input
                    defaultValue={editingItem.currentStockOz}
                    min="0"
                    name="currentStockOz"
                    required
                    step="0.01"
                    type="number"
                  />
                </label>
                <label>
                  Restock threshold (oz)
                  <input
                    defaultValue={editingItem.thresholdOz ?? ""}
                    min="0"
                    name="thresholdOz"
                    required
                    step="0.01"
                    type="number"
                  />
                </label>
              </div>
              <label>
                Maximum capacity (oz)
                <input
                  defaultValue={editingItem.maxStockOz ?? ""}
                  min="0.01"
                  name="maxStockOz"
                  required
                  step="0.01"
                  type="number"
                />
              </label>
              <label>
                Reason for change
                <textarea
                  name="reason"
                  placeholder="Physical count, corrected threshold, spoilage…"
                  required
                  rows={3}
                />
              </label>
              <div className="modal-actions">
                <Link className="secondary-button" href="/#all-inventory">
                  Cancel
                </Link>
                <button className="primary-button" type="submit">
                  Save changes
                </button>
              </div>
            </form>
          </section>
        </div>
      )}
    </main>
  );
}
