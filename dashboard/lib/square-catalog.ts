import "server-only";

export type SquareCatalogVariation = {
  square_variation_id: string;
  item_name: string;
  variation_name: string | null;
  display_name: string;
  sku: string | null;
};

type CatalogVariationObject = {
  id?: string;
  is_deleted?: boolean;
  item_variation_data?: {
    name?: string;
    sku?: string;
  };
};

type CatalogItemObject = {
  type?: string;
  is_deleted?: boolean;
  item_data?: {
    name?: string;
    variations?: CatalogVariationObject[];
  };
};

type CatalogListResponse = {
  objects?: CatalogItemObject[];
  cursor?: string;
};

function requiredEnvironmentVariable(name: string): string {
  const value = process.env[name]?.trim();

  if (!value) {
    throw new Error(`Missing required environment variable: ${name}`);
  }

  return value;
}

export async function fetchSquareCatalogVariations(): Promise<
  SquareCatalogVariation[]
> {
  if (requiredEnvironmentVariable("SQUARE_ENVIRONMENT") !== "production") {
    throw new Error("Owner Setup only accepts the production Square catalog");
  }

  const accessToken = requiredEnvironmentVariable("SQUARE_ACCESS_TOKEN");
  const variations = new Map<string, SquareCatalogVariation>();
  let cursor: string | undefined;

  do {
    const url = new URL("https://connect.squareup.com/v2/catalog/list");
    url.searchParams.set("types", "ITEM");

    if (cursor) {
      url.searchParams.set("cursor", cursor);
    }

    const response = await fetch(url, {
      cache: "no-store",
      headers: {
        Authorization: `Bearer ${accessToken}`,
        "Content-Type": "application/json",
        "Square-Version": "2026-07-15",
      },
    });

    if (!response.ok) {
      throw new Error(
        `Square catalog request failed with status ${response.status}`,
      );
    }

    const page = await response.json() as CatalogListResponse;

    for (const object of page.objects ?? []) {
      if (
        object.type !== "ITEM"
        || object.is_deleted
        || !object.item_data
      ) {
        continue;
      }

      const itemName = object.item_data.name?.trim() || "Unnamed item";

      for (const variation of object.item_data.variations ?? []) {
        const id = variation.id?.trim();

        if (!id || variation.is_deleted) {
          continue;
        }

        const variationName = (
          variation.item_variation_data?.name?.trim() || null
        );
        const displayName = (
          variationName
            ? `${itemName} · ${variationName}`
            : itemName
        );

        variations.set(id, {
          square_variation_id: id,
          item_name: itemName,
          variation_name: variationName,
          display_name: displayName,
          sku: variation.item_variation_data?.sku?.trim() || null,
        });
      }
    }

    cursor = page.cursor || undefined;
  } while (cursor);

  return [...variations.values()].sort(
    (left, right) => left.display_name.localeCompare(right.display_name),
  );
}
