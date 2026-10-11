/**
 * Closed list of merchant categories. The slugs are the OpenStreetMap ones
 * because seed_demo_merchants already stored 'cafe' and 'restaurant': keeping
 * them means no data migration. The labels live in messages/*.json under
 * `merchantCategories.<slug>`.
 */
const MERCHANT_CATEGORIES = [
  "cafe",
  "bakery",
  "restaurant",
  "convenience",
  "grocery",
  "pharmacy",
  "services",
  "other",
] as const;

type MerchantCategory = (typeof MERCHANT_CATEGORIES)[number];

const OSM_CATEGORY: Record<string, MerchantCategory> = {
  cafe: "cafe",
  coffee_shop: "cafe",
  bakery: "bakery",
  pastry: "bakery",
  restaurant: "restaurant",
  fast_food: "restaurant",
  food_court: "restaurant",
  bar: "restaurant",
  pub: "restaurant",
  convenience: "convenience",
  kiosk: "convenience",
  newsagent: "convenience",
  supermarket: "grocery",
  grocery: "grocery",
  greengrocer: "grocery",
  butcher: "grocery",
  pharmacy: "pharmacy",
  chemist: "pharmacy",
  hairdresser: "services",
  beauty: "services",
  laundry: "services",
  car_repair: "services",
};

function isMerchantCategory(value: unknown): value is MerchantCategory {
  return MERCHANT_CATEGORIES.includes(value as MerchantCategory);
}

/** Never returns undefined: an unknown place is still a business. */
function categoryFromOsm(osmValue: string | null | undefined): MerchantCategory {
  return OSM_CATEGORY[osmValue ?? ""] ?? "other";
}

export { categoryFromOsm, isMerchantCategory, MERCHANT_CATEGORIES };
export type { MerchantCategory };
