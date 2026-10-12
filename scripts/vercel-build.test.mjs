import { describe, expect, it, vi } from "vitest";
import { buildSteps, runAll, shouldMigrate } from "./vercel-build.mjs";

describe("shouldMigrate", () => {
  it("migra en producción", () => {
    expect(shouldMigrate("production")).toBe(true);
    expect(shouldMigrate("production", "true")).toBe(true);
  });

  it("no migra en un preview que comparte la base con producción", () => {
    expect(shouldMigrate("preview")).toBe(false);
    expect(shouldMigrate("preview", undefined)).toBe(false);
  });

  it("migra en un preview con base propia (preview branching de Neon)", () => {
    expect(shouldMigrate("preview", "true")).toBe(true);
  });

  // Review Focus 1: falla cerrado ante cualquier valor que no sea exactamente el esperado.
  it("no migra con un valor inesperado, vacío o ausente", () => {
    expect(shouldMigrate("Production")).toBe(false);
    expect(shouldMigrate("")).toBe(false);
    expect(shouldMigrate(undefined)).toBe(false);
    expect(shouldMigrate("development")).toBe(false);
    expect(shouldMigrate("development", "true")).toBe(false);
    expect(shouldMigrate(undefined, "true")).toBe(false);
    for (const flag of ["1", "TRUE", "yes", "", " true"]) expect(shouldMigrate("preview", flag)).toBe(false);
  });
});

describe("buildSteps", () => {
  it("en producción migra antes de compilar", () => {
    expect(buildSteps("production")).toEqual([
      ["npx", ["prisma", "migrate", "deploy"]],
      ["npx", ["next", "build"]],
    ]);
  });

  it("en preview sin base propia solo compila", () => {
    expect(buildSteps("preview")).toEqual([["npx", ["next", "build"]]]);
  });

  it("en preview con base propia migra antes de compilar", () => {
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
