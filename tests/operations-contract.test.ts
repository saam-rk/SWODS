import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

import { describe, expect, it } from "vitest";

function repositoryFile(path: string) {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

describe("production operations contracts", () => {
  it("fails closed when production Supabase configuration is missing", () => {
    const result = spawnSync(process.execPath, ["scripts/validate-production-env.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: "",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "",
        SUPABASE_SERVICE_ROLE_KEY: "",
      },
    });

    expect(result.status).toBe(1);
    expect(result.stderr).toContain("NEXT_PUBLIC_SUPABASE_URL is required");
    expect(result.stderr).toContain("NEXT_PUBLIC_SUPABASE_ANON_KEY is required");
    expect(result.stderr).toContain("SUPABASE_SERVICE_ROLE_KEY is required");
  });

  it("accepts hosted public and server-only Supabase credentials", () => {
    const result = spawnSync(process.execPath, ["scripts/validate-production-env.mjs"], {
      cwd: process.cwd(),
      encoding: "utf8",
      env: {
        ...process.env,
        NEXT_PUBLIC_SUPABASE_URL: "https://project.supabase.co",
        NEXT_PUBLIC_SUPABASE_ANON_KEY: "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoiYW5vbiJ9.signature",
        SUPABASE_SERVICE_ROLE_KEY: "eyJhbGciOiJIUzI1NiJ9.eyJyb2xlIjoic2VydmljZV9yb2xlIn0.signature",
      },
    });

    expect(result.status).toBe(0);
    expect(result.stdout).toContain("validation passed");
  });

  it("keeps local anonymous auth aligned with participant joining", () => {
    expect(repositoryFile("supabase/config.toml")).toMatch(/enable_anonymous_sign_ins = true/);
  });

  it("does not runtime-cache private navigation responses", () => {
    const serviceWorker = repositoryFile("public/sw.js");
    const navigationHandler = serviceWorker.slice(
      serviceWorker.indexOf('event.request.mode === "navigate"'),
      serviceWorker.indexOf("if (!url.pathname.startsWith", serviceWorker.indexOf('event.request.mode === "navigate"')),
    );
    expect(navigationHandler).not.toContain("cache.put(event.request");
    expect(navigationHandler).toContain('caches.match("/")');
  });

  it("runs the full verification gate in CI", () => {
    const workflow = repositoryFile(".github/workflows/ci.yml");
    for (const command of ["npm ci", "npm run typecheck", "npm run lint", "npm test", "npm run build"]) {
      expect(workflow).toContain(command);
    }
  });
});
