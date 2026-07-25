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
