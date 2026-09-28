// Builds the Chrome extension and the Premiere UXP plugin into their dist/ folders.
// Usage: node scripts/build.mjs [extension|premiere]
import { build } from "esbuild";
import { cpSync, mkdirSync, rmSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const root = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const target = process.argv[2];

async function buildExtension() {
  const out = resolve(root, "extension/dist");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(resolve(root, "extension/public"), out, { recursive: true });
  await build({
    entryPoints: [resolve(root, "extension/src/content.ts")],
    outfile: resolve(out, "content.js"),
    bundle: true,
    format: "iife",
    target: "chrome116",
    charset: "utf8",
    legalComments: "none",
    logLevel: "warning",
  });
  console.log("✓ extension → extension/dist");
}

async function buildPremiere() {
  const out = resolve(root, "premiere-plugin/dist");
  rmSync(out, { recursive: true, force: true });
  mkdirSync(out, { recursive: true });
  cpSync(resolve(root, "premiere-plugin/public"), out, { recursive: true });
  await build({
    entryPoints: [resolve(root, "premiere-plugin/src/main.ts")],
    outfile: resolve(out, "index.js"),
    bundle: true,
    // UXP provides a CommonJS `require` for host modules; keep those calls as-is.
    format: "iife",
    platform: "neutral",
    external: ["premierepro", "uxp"],
    target: "es2020",
    charset: "utf8",
    legalComments: "none",
    logLevel: "warning",
  });
  console.log("✓ premiere plugin → premiere-plugin/dist");
}

if (!target || target === "extension") await buildExtension();
if (!target || target === "premiere") await buildPremiere();
