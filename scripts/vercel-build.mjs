#!/usr/bin/env node
// Build de Vercel. Producción siempre migra. Un preview migra solo con
// PREVIEW_DB_BRANCHING=true, que se setea (scope Preview) únicamente cuando la
// integración de Neon le da a cada preview su propia rama de base: sin eso el
// preview comparte DATABASE_URL con producción y `prisma migrate deploy` desde
// una rama mutaría el esquema real. Falla cerrado ante cualquier otro valor.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function shouldMigrate(vercelEnv, previewDbBranching) {
  if (vercelEnv === "production") return true;
  return vercelEnv === "preview" && previewDbBranching === "true";
}

export function buildSteps(vercelEnv, previewDbBranching) {
  const steps = [];
  if (shouldMigrate(vercelEnv, previewDbBranching)) steps.push(["npx", ["prisma", "migrate", "deploy"]]);
  steps.push(["npx", ["next", "build"]]);
  return steps;
}

/** Corre los pasos en orden y corta en el primero que falle, con su código. */
export function runAll(steps, { spawn = spawnSync, exit = process.exit } = {}) {
  for (const [command, args] of steps) {
    const { status } = spawn(command, args, { stdio: "inherit" });
    if (status !== 0) return exit(status ?? 1);
  }
}

function main() {
  const env = process.env.VERCEL_ENV;
  const branching = process.env.PREVIEW_DB_BRANCHING;
  if (!shouldMigrate(env, branching)) {
    console.log(
      `vercel-build: VERCEL_ENV=${env ?? "(ausente)"} PREVIEW_DB_BRANCHING=${branching ?? "(ausente)"} — se omiten las migraciones`,
    );
  }
  runAll(buildSteps(env, branching));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
