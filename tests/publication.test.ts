import { copyFileSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const root = process.cwd();
const validator = resolve(root, "scripts/validate-publication.mjs");
const fixtures = ["docs/ASSET_MANIFEST.json", "LICENSE", "THIRD_PARTY_NOTICES.md", "licenses/Apfel-Grotezk-OFL.txt", ".env.example", "public/shared-field.svg", "public/icon.svg", "public/favicon.svg", "public/demo-target.svg", "public/icon-192.png", "public/icon-512.png"];
function check(cwd: string) {
  return spawnSync(process.execPath, [validator], { cwd, encoding: "utf8" });
}
function withFixture(run: (directory: string) => void) {
  const directory = mkdtempSync(join(tmpdir(), "swods-publication-"));
  try {
    for (const path of fixtures) {
      const output = join(directory, path);
      mkdirSync(dirname(output), { recursive: true });
      copyFileSync(resolve(root, path), output);
    }
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe("public source gate", () => {
  it("accepts the actual edition with approved assets and dummy CI credentials", () => {
    const result = check(root);
    expect(result.stderr).toBe("");
    expect(result.status).toBe(0);
  });
  it("rejects private workspaces and environment files", () => {
    withFixture((directory) => {
      mkdirSync(join(directory, "video"));
      writeFileSync(join(directory, ".env.production"), "LOCAL_ONLY=1");
      const result = check(directory);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("video");
      expect(result.stderr).toContain(".env.production");
    });
  });
  it("rejects unexpected media and modified approved artwork", () => {
    withFixture((directory) => {
      writeFileSync(join(directory, "public", "unapproved.svg"), "<svg/>");
      writeFileSync(join(directory, "public", "shared-field.svg"), "<svg/>");
      const result = check(directory);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("unapproved.svg");
      expect(result.stderr).toContain("shared-field.svg");
    });
  });
  it("rejects credential-shaped content without printing its value", () => {
    withFixture((directory) => {
      const token = ["ghp_", "abcdefghijklmnopqrstuvwx"].join("");
      writeFileSync(join(directory, "README.md"), token);
      const result = check(directory);
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("Potential credential");
      expect(result.stderr).not.toContain(token);
    });
  });
});
