# Square & Supabase Inventory System - Project Report

**Overview**
We have built a complete backend system to synchronize Square POS data with a Supabase database, enabling real-time inventory tracking, ingredient depletion based on recipes, and a barcode-based receiving workflow.

## 🚀 Features Built

### 1. Ingredient Depletion (Order Processing)
**File**: `process_orders.ts`
*   **What it does**: Automatically calculates how much inventory was used based on sales.
*   **Logic**:
    1.  Polls Square for recent orders every 5 minutes.
    2.  Identifies the Menu Item sold (e.g., "Caramel Latte").
    3.  Looks up the **Recipe** (e.g., "1oz Espresso + 8oz Milk").
    4.  Deducts the exact amount from the `ingredients` table.

### 2. Receiving Interface (Barcode Scanner)
**File**: `receive_stock.ts`
*   **What it does**: Allows staff to restock inventory by scanning barcodes.
*   **Logic**:
    *   Accepts a GFS Code (barcode) and Quantity.
    *   Instantly finds the matching ingredient and updates the stock level.
    *   *Usage*: `npx ts-node receive_stock.ts BEAN-001 50`

### 3. Data Synchronization
**File**: `sync.ts`
*   **What it does**: Keeps the catalog in sync.
*   **Features**:
    *   Fetches all items from Square.
    *   Handles "Variations" (Small, Medium, Large).
    *   Updates the `inventory` table in Supabase.

### 4. Database Architecture (Supabase)
We established a relational "Bill of Materials" structure:
*   **`menu_items`**: The products you sell (linked to Square IDs).
*   **`ingredients`**: The raw stock you count (Beans, Milk, Cups).
*   **`recipes`**: The logic linking them (Item A *requires* 5oz of Ingredient B).
*   **`inventory`**: A raw sync of Square counts.

### 5. Managing Data (Handover)
We created tools to make this easy for others to take over:
*   **`HANDOVER_GUIDE.md`**: Full instructions for Cory on how to install and use this on the Pi.
*   **`add_new_data.ts`**: A template script. Just fill in the blanks at the top and run it to add new Menu Items & Recipes instantly.

## 🛠️ How to Run It (Raspberry Pi)

1.  **Start Order Sync Service**:
    ```bash
    # Starts the "Forever Loop" (checks every 60s)
    npx ts-node process_orders.ts
    ```

2.  **Receive Stock** (When truck arrives):
    ```bash
    # Scan item and type qty
    npx ts-node receive_stock.ts <BARCODE> <QTY>
    ```

## ✅ Setup Status
*   **Dependencies**: Installed (`square`, `@supabase/supabase-js`, `dotenv`).
*   **Verification**: All scripts tested and verified locally.
*   **Next Steps**: Add real API Keys to `.env` and populate proper Menu/Recipe data.
