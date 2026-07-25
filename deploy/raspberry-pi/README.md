# Raspberry Pi deployment

This setup keeps the dashboard and order processor on the store's Raspberry Pi
while Supabase remains the durable inventory database.

## Recommended Pi

- Raspberry Pi 4 or 5 with at least 4 GB RAM
- Raspberry Pi OS 64-bit
- Ethernet connection when possible
- High-endurance microSD card
- Correct `America/New_York` timezone
- Node.js 22 LTS

Clone the repository to:

```text
/opt/ghost-inventory/app
```

Create:

```text
/etc/ghost-inventory/dashboard.env
/etc/ghost-inventory/sync.env
```

Use `dashboard.env.example` and `sync.env.example` as templates. Lock both
files so only root can read them.

## Services

- `ghost-inventory-dashboard.service` keeps the owner website running.
- `ghost-inventory-sync.timer` invokes the idempotent Square processor every
  15 minutes.
- `ghost-inventory-sync.service` performs one processing run and exits.

Copy the three unit files to `/etc/systemd/system/`, then reload systemd.

Enable the dashboard immediately. Do **not** enable the Square timer until:

1. The physical starting counts are accurate.
2. `npm run initialize-sync` has recorded the starting checkpoint.
3. One controlled food order has passed the pilot checklist.

After those checks:

```bash
sudo systemctl enable --now ghost-inventory-dashboard.service
sudo systemctl enable --now ghost-inventory-sync.timer
```

The store can then open `http://<pi-address>:3000` on its Wi-Fi. Configure
Avahi later if the store wants the friendlier `http://ghost-inventory.local:3000`
address.

Do not expose port `3000` using router port forwarding. Use a secured
Cloudflare Tunnel if remote access is added.
