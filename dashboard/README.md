# Ghost Coffee Owner Dashboard

Private, Raspberry Pi-hosted inventory controls for Ghost Coffee Roaster.

## What the owner can do

- See ingredients below their restock thresholds.
- Review current, threshold, and maximum stock.
- Record physical-count corrections with an audit reason.
- Record deliveries for ingredients with configured GFS codes and pack sizes.
- Review recent inventory adjustments and deliveries.
- Confirm the timestamp of the latest successful Square processing window.

The dashboard never calls Square. It reads and updates inventory in Supabase
through server-only credentials. Square remains read-only in the separate order
processor.

## Required environment

Copy `.env.example` to `.env.local` for development or set the same variables
in `/etc/ghost-inventory/dashboard.env` on the Raspberry Pi.

Generate the stored password hash:

```bash
npm run auth:hash -- "a-long-owner-password"
```

Generate the session secret:

```bash
openssl rand -hex 32
```

Never commit either value or the Supabase service-role key.
Do not paste owner credentials into repository documentation, screenshots,
issues, or project chats. Share a temporary password through a separate secure
channel and rotate it if it is exposed.

## Shareable demo mode

Set `DASHBOARD_DEMO_MODE=true` and `DASHBOARD_ALLOW_WRITES=false` to run the
dashboard with built-in sample inventory, recipes, and activity. Demo mode
does not create a Supabase client or call Square, and it blocks every write
even if the write flag is accidentally enabled. Remove Supabase and Square
credentials from any environment used for a public demo.

Login attempts are paused for 15 minutes after five failures from the same
detected network address. This protection is intentionally dependency-free and
works well for the single Raspberry Pi process. It is best-effort on distributed
cloud hosting because separate server instances do not share memory; hosting
access controls and a strong unique password are still required.

For local Wi-Fi access, leave `DASHBOARD_SECURE_COOKIE=false`. Change it to
`true` only when the dashboard is served over HTTPS through a secure tunnel.

## Development

```bash
npm install
npm run dev
```

Open `http://localhost:3000`.

## Production

```bash
npm ci
npm run build
npm start
```

The production server listens on every network interface at port `3000`.
Use the systemd example in `../deploy/raspberry-pi/` so it restarts after
power loss.

Before the store rollout, use `../OWNER_MEETING_CHECKLIST.md` to collect the
owner-approved inventory and recipe values. Do not enable automatic processing
from a demo or code-only review.
