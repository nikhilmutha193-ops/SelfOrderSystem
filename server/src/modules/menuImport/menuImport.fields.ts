/**
 * The dish columns the Excel import and export understand. `locked` ones are always used: Category and Name find the
 * dish, so a row can be matched to a dish that already exists. Everything else can be switched off before importing,
 * which leaves that detail alone (the dish keeps its value, or a new dish gets the usual default).
 */
export interface ImportField {
  key: string;
  label: string;
  locked?: boolean;
  /** Other header spellings that mean the same column (compared without case, spaces or punctuation). */
  aliases?: string[];
}

export const IMPORT_FIELDS: ImportField[] = [
  { key: "category", label: "Category", locked: true, aliases: ["category name"] },
  { key: "subcategory", label: "Subcategory", aliases: ["sub category", "subcategory name"] },
  { key: "name", label: "Name", locked: true, aliases: ["dish", "dish name", "item", "item name", "food item"] },
  { key: "price", label: "Price", aliases: ["rate", "mrp", "amount", "dine in price"] },
  { key: "description", label: "Description" },
  { key: "foodType", label: "Food type", aliases: ["type", "veg or non veg", "veg non veg", "veg/non-veg"] },
  { key: "isActive", label: "Active", aliases: ["is active", "available", "status"] },
  { key: "isBestseller", label: "Bestseller", aliases: ["is bestseller"] },
  { key: "isTodaySpecial", label: "Today's special", aliases: ["todays special", "today special", "special"] },
  { key: "shortCode", label: "Short code", aliases: ["code"] },
  { key: "prepTimeMinutes", label: "Prep time (min)", aliases: ["prep time", "preparation time", "prep minutes"] },
  { key: "packagingCharge", label: "Packaging charge", aliases: ["packaging", "packing charge"] },
  { key: "takeawayPrice", label: "Takeaway price", aliases: ["takeaway"] },
  { key: "deliveryPrice", label: "Delivery price", aliases: ["delivery"] },
  { key: "jainAvailable", label: "Jain available", aliases: ["jain"] },
  { key: "spiceAdjustable", label: "Spice adjustable", aliases: ["spice"] },
  { key: "station", label: "Station", aliases: ["kitchen station"] },
  { key: "imageUrl", label: "Image URL", aliases: ["image", "photo", "picture"] },
];

const simplify = (text: string) => text.toLowerCase().replace(/[^a-z0-9]+/g, "");

const HEADER_LOOKUP = new Map<string, string>();
for (const field of IMPORT_FIELDS) {
  HEADER_LOOKUP.set(simplify(field.label), field.key);
  HEADER_LOOKUP.set(simplify(field.key), field.key);
  for (const alias of field.aliases ?? []) HEADER_LOOKUP.set(simplify(alias), field.key);
}

/** The field a spreadsheet header stands for, or null when it is not one we know. */
export function fieldForHeader(header: string): string | null {
  return HEADER_LOOKUP.get(simplify(header)) ?? null;
}
