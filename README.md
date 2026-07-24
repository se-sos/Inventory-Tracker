# Square to Supabase Inventory Sync

This project synchronizes inventory counts from Square to a Supabase database.

## Prerequisites

1.  **Node.js**: You need Node.js installed to run this script. [Download here](https://nodejs.org/).
2.  **Supabase Project**: A Supabase project to store the data.

## Setup

1.  **Install Dependencies**:
    Open a terminal in this folder and run:
    ```bash
    npm install
    ```

2.  **Configure Environment**:
    Copy `.env.example` to `.env` and fill in your keys:
    *   `SQUARE_ACCESS_TOKEN`: Your Square API Access Token (Sandbox or Production).
    *   `SQUARE_ENVIRONMENT`: set to `sandbox` or `production`.
    *   `SUPABASE_URL`: Your Supabase Project URL.
    *   `SUPABASE_SERVICE_ROLE_KEY`: Your server-only Supabase Service Role Key. Never commit or expose it in a browser.

3.  **Setup Database**:
    Copy the contents of `schema.sql` and run it in your Supabase SQL Editor to create the `inventory` table.
    Then run `add_processed_orders.sql` to install duplicate-order protection.

## Running the Sync

To run the synchronization script:

```bash
npx ts-node sync.ts
```

This will:
1.  Fetch all items from Square.
2.  Fetch inventory counts for those items.
3.  Update the `inventory` table in Supabase.
