import { categoryFromOsm, type MerchantCategory } from "./merchant-categories";
import { type Currency, currencyForCountry } from "./money";

type PlaceSuggestion = {
  placeId: string;
  name: string;
  category: MerchantCategory;
  city: string;
  streetAddress: string;
  country: string;
  currency: Currency;
  lat: number;
  lng: number;
};

type PhotonFeature = {
  properties?: Record<string, unknown>;
  // `type` is "Point" in every Photon answer; declared so a realistic fixture
  // typechecks, and unused because only the coordinates matter here.
  geometry?: { type?: string; coordinates?: unknown };
};

const text = (value: unknown) => (typeof value === "string" ? value.trim() : "");

/**
 * One Photon feature as the merchant form needs it. OpenStreetMap data is
 * uneven — a place often has no house number and sometimes no city — so every
 * missing field degrades to an empty string the merchant can fill in by hand,
 * never to "undefined". A place with no name or no coordinates is dropped.
 */
function normalizePhoton(feature: PhotonFeature): PlaceSuggestion | undefined {
  const p = feature.properties ?? {};
  const coordinates = feature.geometry?.coordinates;
  if (!Array.isArray(coordinates) || coordinates.length < 2) return undefined;
  const [lng, lat] = coordinates;
  const name = text(p.name);
  if (!name || typeof lat !== "number" || typeof lng !== "number") return undefined;

  const street = text(p.street);
  const houseNumber = text(p.housenumber);
  const country = text(p.countrycode).toUpperCase();
  return {
    placeId: `${text(p.osm_type) || "N"}${typeof p.osm_id === "number" ? p.osm_id : text(p.osm_id)}`,
    name,
    category: categoryFromOsm(text(p.osm_value)),
    city: text(p.city) || text(p.state),
    streetAddress: [street, houseNumber].filter(Boolean).join(" "),
    country,
    currency: currencyForCountry(country),
    lat,
    lng,
  };
}

export { normalizePhoton };
export type { PlaceSuggestion };
