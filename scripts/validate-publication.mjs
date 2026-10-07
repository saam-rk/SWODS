import { createHash } from "node:crypto";
import { readdir, readFile } from "node:fs/promises";
import { resolve, relative } from "node:path";
import { fileURLToPath } from "node:url";

const sourceDirectories = new Set([".github", "app", "components", "docs", "lib", "licenses", "locales", "public", "scripts", "styles", "supabase", "tests"]);
const sourceFiles = new Set([".env.example", ".eslintignore", ".eslintrc.json", ".gitignore", ".gitattributes", "DESIGN.md", "PRODUCT.md", "PRODUCTION_READINESS.md", "README.md", "LICENSE", "THIRD_PARTY_NOTICES.md", "next.config.ts", "next-env.d.ts", "package.json", "package-lock.json", "playwright.config.ts", "postcss.config.mjs", "tsconfig.json", "vitest.config.ts"]);
const generatedDirectories = new Set([".git", "node_modules", ".next", "dist", "coverage", "audit-artifacts", "test-results", "playwright-report"]);
const excludedSourcePaths = /(?:^|\/)(?:video|\.impeccable|\.agents|\.pi|\.claude|\.codex|\.temp|\.branches|\.backup)(?:\/|$)|(?:^|\/)\.env(?!\.example$)(?:\.|$)|(?:^|\/)docs\/(?:PROMPT|IMPLEMENTATION_PLAN|PRODUCTION_AUDIT)\.md$|\.(?:pem|key|p12|pfx|zip|tgz|mp4|mov|jpe?g|webp)$/i;
const forbiddenSecrets = [
  /-----BEGIN (?:RSA |EC |OPENSSH )?PRIVATE KEY-----/,
  /(?:sb_secret_|sb_publishable_|sk_live_|sk-proj-|ghp_|github_pat_|xox[baprs]-|AKIA)[A-Za-z0-9_-]{12,}/,
  /(?:postgres(?:ql)?|https?):\/\/[^\s/:]+:[^\s/@]+@/,
];

export async function validatePublication(root = process.cwd()) {
  const files = [];
  const failures = [];
  async function visit(directory, topLevel = false) {
    for (const entry of await readdir(directory, { withFileTypes: true })) {
      const full = resolve(directory, entry.name);
      const path = relative(root, full).replaceAll("\\", "/");
      if (entry.isSymbolicLink()) { failures.push(`Symbolic link is not exportable: ${path}`); continue; }
      if (topLevel && entry.isDirectory() && generatedDirectories.has(entry.name)) continue;
      if (topLevel && entry.isFile() && (entry.name.endsWith(".tsbuildinfo") || entry.name === "debug.log")) continue;
      if (excludedSourcePaths.test(path)) { failures.push(`Private or unapproved source path: ${path}`); continue; }
      if (topLevel && !(entry.isDirectory() ? sourceDirectories.has(entry.name) : sourceFiles.has(entry.name))) {
        failures.push(`Unknown root entry requires explicit review: ${path}`); continue;
      }
      if (entry.isDirectory()) { await visit(full); continue; }
      if (!entry.isFile()) { failures.push(`Unsupported entry: ${path}`); continue; }
      if (path.startsWith("supabase/.temp/") || path.startsWith("supabase/.branches/")) { failures.push(`Local Supabase metadata: ${path}`); continue; }
      files.push(path);
    }
  }
  await visit(resolve(root), true);
  let manifest;
  try {
    manifest = JSON.parse(await readFile(resolve(root, "docs/ASSET_MANIFEST.json"), "utf8"));
  } catch (error) {
    throw new Error("Cannot read a valid asset manifest", { cause: error });
  }
  if (!Array.isArray(manifest?.assets)) throw new Error("Invalid asset manifest structure");
  const approved = new Map(manifest.assets.map((asset) => [asset.path, asset]));
  const expectedAssets = ["public/shared-field.svg", "public/icon.svg", "public/favicon.svg", "public/demo-target.svg", "public/icon-192.png", "public/icon-512.png"];
  if (approved.size !== expectedAssets.length || expectedAssets.some((path) => !approved.has(path))) failures.push("Unexpected asset manifest entries");
  for (const path of expectedAssets) if (!files.includes(path)) failures.push(`Missing approved asset: ${path}`);
  for (const path of files) {
    const bytes = await readFile(resolve(root, path));
    if (path.startsWith("public/") && path !== "public/sw.js") {
      const asset = approved.get(path);
      if (!asset || createHash("sha256").update(bytes).digest("hex") !== asset.sha256 || asset.license !== "MIT") failures.push(`Unapproved or changed asset: ${path}`);
    }
    if (bytes.includes(0)) {
      if (!approved.has(path)) failures.push(`Unapproved binary: ${path}`);
      continue;
    }
    const text = bytes.toString("utf8");
    if (forbiddenSecrets.some((pattern) => pattern.test(text))) failures.push(`Potential credential (value redacted): ${path}`);
    for (const match of text.matchAll(/eyJ[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}\.[A-Za-z0-9_-]{8,}/g)) {
      const token = match[0];
      const isFixture = [".github/workflows/ci.yml", "tests/operations-contract.test.ts"].includes(path)
        && ["signature", "ci-signature"].includes(token.split(".")[2]);
      if (!isFixture) failures.push(`Potential JWT (value redacted): ${path}`);
    }
    if (/autumn-collage(?:-mobile)?\.(?:png|webp)/.test(text)) failures.push(`Reference to retired artwork: ${path}`);
  }
  for (const path of ["LICENSE", "THIRD_PARTY_NOTICES.md", "licenses/Apfel-Grotezk-OFL.txt", ".env.example"]) if (!files.includes(path)) failures.push(`Missing legal/configuration file: ${path}`);
  if (failures.length) throw new Error([...new Set(failures)].join("\n"));
  return files.sort();
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  try {
    const files = await validatePublication();
    console.log(`Publication source checks passed: ${files.length} files; six approved geometric assets; no detected secret patterns. Generated directories are excluded, not certified. This is not a legal or security guarantee.`);
  } catch (error) {
    console.error(error instanceof Error ? error.message : String(error));
    process.exitCode = 1;
  }
}
