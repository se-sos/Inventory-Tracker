import { redirect } from "next/navigation";
import { loginAction } from "../actions";
import { getDashboardSession } from "@/lib/auth";

type SearchParams = Promise<Record<string, string | string[] | undefined>>;

export default async function LoginPage({
  searchParams,
}: {
  searchParams: SearchParams;
}) {
  if (await getDashboardSession()) {
    redirect("/");
  }

  const params = await searchParams;
  const rawError = params.error;
  const error = Array.isArray(rawError) ? rawError[0] : rawError;

  return (
    <main className="login-shell">
      <section className="login-story">
        <div className="brand">
          <span className="brand-mark light">GC</span>
          <div>
            <p className="eyebrow">Ghost Coffee Roaster</p>
            <h1>Inventory control</h1>
          </div>
        </div>
        <div>
          <p className="eyebrow">Operations, without the guesswork</p>
          <h2>Start each shift knowing what is ready—and what is running low.</h2>
        </div>
        <p className="login-footnote">
          Private owner access · Square remains read-only
        </p>
      </section>

      <section className="login-panel">
        <form action={loginAction} className="login-form">
          <div>
            <p className="eyebrow">Owner access</p>
            <h2>Sign in</h2>
            <p>Use the account configured for this store.</p>
          </div>
          {error && <div className="notice error">{error}</div>}
          <label>
            Email
            <input
              autoComplete="email"
              name="email"
              placeholder="owner@ghostcoffee.com"
              required
              type="email"
            />
          </label>
          <label>
            Password
            <input
              autoComplete="current-password"
              name="password"
              required
              type="password"
            />
          </label>
          <button className="primary-button login-button" type="submit">
            Open inventory
          </button>
        </form>
      </section>
    </main>
  );
}
