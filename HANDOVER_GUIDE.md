# Project Handover Guide (For Cory)

This project synchronizes Square Orders with a Supabase Inventory Database.

## 1. What's in the Box?
*   **`process_orders.ts`**: The main service. It polls Square every 60s, finds new orders, and deducts ingredients from stock.
*   **`receive_stock.ts`**: A script to add inventory using Barcodes/GFS Codes.
*   **`add_new_data.ts`**: A template to easily add new Menu Items & Recipes.

## 2. Installation (Raspberry Pi)
1.  **Copy Files**: Copy this entire folder to the Pi.
2.  **Install**: Open terminal in the folder and run:
    ```bash
    npm install
    ```
3.  **Credentials**: You need to create a `.env` file in this folder (it is secret, so it's not included).
    *   Ask Sean for the `SUPABASE_URL` and `SUPABASE_KEY`.
    *   Add your `SQUARE_ACCESS_TOKEN` from the Square Developer Dashboard.
    *   Format:
        ```env
        SUPABASE_URL=https://your-project.supabase.co
        SUPABASE_KEY=your-secret-key
        SQUARE_ACCESS_TOKEN=your-square-token
        ```

## 3. How to Use
### Running the Sync Service (Daily)
This script is designed to run **once per day** (e.g., at midnight). It will check for all orders in the last 24 hours.

**Manual Run**:
```bash
npx ts-node process_orders.ts
```

**Automatic Run (Cron Job)**:
On the Pi, you can set this to run automatically at 2 AM:
1.  Type `crontab -e`
2.  Add this line:
    ```
    0 2 * * * cd /path/to/square-supabase-sync && /usr/bin/npx ts-node process_orders.ts
    ```

### Receiving Stock
When the GFS truck arrives:
```bash
npx ts-node receive_stock.ts <BARCODE> <QTY>
# Example: npx ts-node receive_stock.ts BEAN-001 50
```

### Adding New Menu Items & Recipes
1.  Open `add_new_data.ts` in any text editor.
2.  Look for the `NEW_ITEM` block at the top.
3.  **Fill in the blanks**:
    ```typescript
    const NEW_ITEM = {
        name: "New Item Name",
        square_id: "ITEM_ID_FROM_SQUARE", 
        item_code: "SHORT-CODE",
        ingredients: [
             // Add as many ingredients as you need
            { name: "Bread", qty_required_oz: 2, gfs_code: "BREAD-001", current_stock_oz: 100 },
            { name: "Cheese", qty_required_oz: 1, gfs_code: "CHEESE-001", current_stock_oz: 50 },
        ]
    };
    ```
4.  Run the script: `npx ts-node add_new_data.ts`
    *   This will automatically create the Menu Item, create the Recipe, and link all the ingredients for you.

## 4. Important Tables (Supabase)
*   **`menu_items`**: Must match Square Item IDs.
*   **`ingredients`**: Your raw stock (Beans, Milk).
*   **`recipes`**: The logic (Latte = 1oz Beans + 8oz Milk).
