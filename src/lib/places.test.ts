import { describe, expect, it } from "vitest";
import { normalizePhoton } from "./places";

// Respuesta real de photon.komoot.io verificada el 11 oct 2026.
const cafeBalcarce = {
  properties: {
    osm_type: "N",
    osm_id: 1234567,
    name: "Cafe Balcarce",
    osm_key: "amenity",
    osm_value: "cafe",
    street: "Antonio Balcarce",
    housenumber: "123",
    city: "Salta",
    state: "Salta",
    country: "Argentina",
    countrycode: "AR",
  },
  geometry: { type: "Point", coordinates: [-65.4118476, -24.7828502] },
};

describe("normalización de lugares", () => {
  it("traduce un lugar completo al modelo del comercio", () => {
    expect(normalizePhoton(cafeBalcarce)).toEqual({
      placeId: "N1234567",
      name: "Cafe Balcarce",
      category: "cafe",
      city: "Salta",
      streetAddress: "Antonio Balcarce 123",
      country: "AR",
      currency: "ARS",
      lat: -24.7828502,
      lng: -65.4118476,
    });
  });

  it("sobrevive sin número de puerta, que en OSM es lo común", () => {
    const place = { ...cafeBalcarce, properties: { ...cafeBalcarce.properties, housenumber: null } };
    expect(normalizePhoton(place)?.streetAddress).toBe("Antonio Balcarce");
  });

  it("sin ciudad usa la provincia, y nunca escribe undefined", () => {
    const place = { ...cafeBalcarce, properties: { ...cafeBalcarce.properties, city: undefined } };
    const result = normalizePhoton(place);
    expect(result?.city).toBe("Salta");
    expect(JSON.stringify(result)).not.toContain("undefined");
  });

  it("sin ciudad ni provincia deja la ciudad vacía para que la escriba el comercio", () => {
    const place = {
      ...cafeBalcarce,
      properties: { ...cafeBalcarce.properties, city: undefined, state: undefined },
    };
    expect(normalizePhoton(place)?.city).toBe("");
  });

  it("un país sin moneda soportada queda en dólares", () => {
    const place = { ...cafeBalcarce, properties: { ...cafeBalcarce.properties, countrycode: "JP" } };
    expect(normalizePhoton(place)?.currency).toBe("USD");
    expect(normalizePhoton(place)?.country).toBe("JP");
  });

  it("descarta un lugar sin nombre o sin coordenadas", () => {
    expect(
      normalizePhoton({ ...cafeBalcarce, properties: { ...cafeBalcarce.properties, name: undefined } }),
    ).toBeUndefined();
    expect(normalizePhoton({ ...cafeBalcarce, geometry: { type: "Point", coordinates: [] } })).toBeUndefined();
  });
});
