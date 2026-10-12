import { describe, expect, it } from "vitest";
import { type MerchantFormValues, validateMerchantForm } from "./merchant-form";

const valid: MerchantFormValues = {
  name: "Café de la Esquina",
  category: "cafe",
  city: "Salta",
  streetAddress: "Balcarce 123",
  country: "AR",
  currency: "ARS",
  email: "hola@cafe.com",
};

describe("validación del alta de comercio", () => {
  it("acepta un comercio completo", () => {
    expect(validateMerchantForm(valid)).toEqual({});
  });

  it("el correo es opcional pero si está tiene que ser válido", () => {
    expect(validateMerchantForm({ ...valid, email: "" })).toEqual({});
    expect(validateMerchantForm({ ...valid, email: "hola" }).email).toBe("emailError");
  });

  it("pide nombre, ciudad y calle con largos razonables", () => {
    expect(validateMerchantForm({ ...valid, name: "A" }).name).toBe("nameError");
    expect(validateMerchantForm({ ...valid, name: "x".repeat(61) }).name).toBe("nameError");
    expect(validateMerchantForm({ ...valid, city: "  " }).city).toBe("cityError");
    expect(validateMerchantForm({ ...valid, streetAddress: "" }).streetAddress).toBe("streetAddressError");
    expect(validateMerchantForm({ ...valid, streetAddress: "x".repeat(121) }).streetAddress).toBe(
      "streetAddressError",
    );
  });

  it("solo acepta rubros de la lista y monedas con tipo de cambio", () => {
    expect(validateMerchantForm({ ...valid, category: "casino" }).category).toBe("categoryError");
    expect(validateMerchantForm({ ...valid, currency: "JPY" }).currency).toBe("currencyError");
    expect(validateMerchantForm({ ...valid, country: "ARG" }).country).toBe("countryError");
    expect(validateMerchantForm({ ...valid, country: "ar" })).toEqual({});
  });
});
