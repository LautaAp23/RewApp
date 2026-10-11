#!/usr/bin/env node
// Build de Vercel. Las migraciones se aplican SOLO en producción: un deploy de
// preview comparte DATABASE_URL con producción, así que `prisma migrate deploy`
// desde una rama mutaría el esquema real. Falla cerrado: cualquier valor que no
// sea exactamente "production" no migra.
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export function shouldMigrate(vercelEnv) {
  return vercelEnv === "production";
}

export function buildSteps(vercelEnv) {
  const steps = [];
  if (shouldMigrate(vercelEnv)) steps.push(["npx", ["prisma", "migrate", "deploy"]]);
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
  if (!shouldMigrate(env)) {
    console.log(`vercel-build: VERCEL_ENV=${env ?? "(ausente)"} — se omiten las migraciones`);
  }
  runAll(buildSteps(env));
}

if (process.argv[1] === fileURLToPath(import.meta.url)) main();
