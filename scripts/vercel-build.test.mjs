import { describe, expect, it, vi } from "vitest";
import { buildSteps, runAll, shouldMigrate } from "./vercel-build.mjs";

describe("shouldMigrate", () => {
  it("migra en producción", () => {
    expect(shouldMigrate("production")).toBe(true);
  });

  it("no migra en un preview sin rama de base propia", () => {
    expect(shouldMigrate("preview")).toBe(false);
    expect(shouldMigrate("preview", "")).toBe(false);
    expect(shouldMigrate("preview", "false")).toBe(false);
    expect(shouldMigrate("preview", "TRUE")).toBe(false);
    expect(shouldMigrate("preview", "1")).toBe(false);
  });

  it("migra en un preview con PREVIEW_DB_BRANCHING=true", () => {
    expect(shouldMigrate("preview", "true")).toBe(true);
  });

  it("PREVIEW_DB_BRANCHING no habilita migrar fuera de preview", () => {
    expect(shouldMigrate("development", "true")).toBe(false);
    expect(shouldMigrate(undefined, "true")).toBe(false);
  });

  // Review Focus 1: falla cerrado ante cualquier valor que no sea exactamente "production".
  it("no migra con un valor inesperado, vacío o ausente", () => {
    expect(shouldMigrate("Production")).toBe(false);
    expect(shouldMigrate("")).toBe(false);
    expect(shouldMigrate(undefined)).toBe(false);
    expect(shouldMigrate("development")).toBe(false);
  });
});

describe("buildSteps", () => {
  it("en producción migra antes de compilar", () => {
    expect(buildSteps("production")).toEqual([
      ["npx", ["prisma", "migrate", "deploy"]],
      ["npx", ["next", "build"]],
    ]);
  });

  it("en preview solo compila", () => {
    expect(buildSteps("preview")).toEqual([["npx", ["next", "build"]]]);
  });

  it("en preview con rama de base propia migra antes de compilar", () => {
    expect(buildSteps("preview", "true")).toEqual([
      ["npx", ["prisma", "migrate", "deploy"]],
      ["npx", ["next", "build"]],
    ]);
  });
});

describe("runAll", () => {
  it("corre los pasos en orden", () => {
    const spawn = vi.fn(() => ({ status: 0 }));
    const exit = vi.fn();
    runAll([["a", []], ["b", []]], { spawn, exit });
    expect(spawn.mock.calls.map(([command]) => command)).toEqual(["a", "b"]);
    expect(exit).not.toHaveBeenCalled();
  });

  // Review Focus 2: si la migración falla, el build NO corre y el deploy falla.
  it("corta con el código del paso que falló y no sigue", () => {
    const spawn = vi.fn(() => ({ status: 3 }));
    const exit = vi.fn();
    runAll([["migrate", []], ["build", []]], { spawn, exit });
    expect(spawn).toHaveBeenCalledTimes(1);
    expect(exit).toHaveBeenCalledWith(3);
  });

  it("corta con 1 cuando el proceso no devolvió código", () => {
    const spawn = vi.fn(() => ({ status: null }));
    const exit = vi.fn();
    runAll([["migrate", []]], { spawn, exit });
    expect(exit).toHaveBeenCalledWith(1);
  });
});
