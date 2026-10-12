import { describe, expect, it } from "vitest";
import { isRegisterChargePath, parseRegisterLock, registerChargePath } from "./register-lock";

const lock = {
  merchant: "0x77cd96A075DdfDc3D286B0256B531DEb26328Cfb" as const,
  registerId: "caja-1",
  derivationIndex: 0,
};

describe("caja abierta", () => {
  it("acepta un bloqueo completo y descarta uno incompleto", () => {
    expect(parseRegisterLock(JSON.stringify(lock))?.registerId).toBe("caja-1");
    expect(parseRegisterLock(JSON.stringify({ ...lock, derivationIndex: 40 }))).toBeNull();
    expect(parseRegisterLock("no")).toBeNull();
  });

  it("la pantalla de cobro de esa caja es la única permitida", () => {
    expect(isRegisterChargePath(registerChargePath(lock), lock)).toBe(true);
    expect(isRegisterChargePath("/comercio/0x77cd96A075DdfDc3D286B0256B531DEb26328Cfb", lock)).toBe(false);
    expect(isRegisterChargePath("/perfil", lock)).toBe(false);
  });
});
