import { describe, expect, it } from "vitest";
import { validateProfileForm } from "./profile-form";

const valid = { name: "Alex Prueba", email: "alex@ejemplo.com" };

describe("validación del registro", () => {
  it("acepta un nombre y un correo razonables", () => {
    expect(validateProfileForm(valid)).toEqual({});
    expect(validateProfileForm({ name: "Ana", email: "a@b.co" })).toEqual({});
  });

  it("pide un nombre de 2 a 40 caracteres, sin contar espacios de los bordes", () => {
    expect(validateProfileForm({ ...valid, name: " A " }).name).toBe("nameError");
    expect(validateProfileForm({ ...valid, name: "  " }).name).toBe("nameError");
    expect(validateProfileForm({ ...valid, name: "x".repeat(41) }).name).toBe("nameError");
    expect(validateProfileForm({ ...valid, name: " Ana " })).toEqual({});
  });

  it("rechaza correos sin forma de correo y los de más de 120", () => {
    for (const email of ["", "alex", "alex@", "@ejemplo.com", "alex@ejemplo", "a b@c.com", "alex@ejemplo .com"]) {
      expect(validateProfileForm({ ...valid, email }).email).toBe("emailError");
    }
    // El borde, en los dos sentidos: 120 entra porque la columna admite 120.
    expect(validateProfileForm({ ...valid, email: `${"a".repeat(115)}@b.co` })).toEqual({});
    expect(validateProfileForm({ ...valid, email: `${"a".repeat(116)}@b.co` }).email).toBe("emailError");
  });
});
