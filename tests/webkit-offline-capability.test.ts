import { spawnSync } from "node:child_process";
import { describe, expect, it } from "vitest";

const prepared = { appCode: false, stage: "offline-reload", controlled: true, cached: true, onlineReload: true };
const internalError = "page.reload: WebKit encountered an internal error\nCall log:";
function classify(evidence: Record<string, unknown>) {
  const script = 'import { classifyWebkitOffline } from "./scripts/probe-webkit-offline.mjs"; let evidence; try { evidence = JSON.parse(process.argv[1]); } catch { process.exit(2); } console.log(classifyWebkitOffline(evidence));';
  const result = spawnSync(process.execPath, ["--input-type=module", "-e", script, JSON.stringify(evidence)], { cwd: process.cwd(), encoding: "utf8" });
  expect(result.status).toBe(0);
  return result.stdout.trim();
}

describe("independent WebKit offline capability classification", () => {
  it("requires a working minimal cached worker before accepting offline support", () => {
    expect(classify({ ...prepared, offlineReload: "passed" })).toBe("supported");
  });
  it("recognizes only the precise internal offline-reload engine error", () => {
    expect(classify({ ...prepared, error: internalError })).toBe("engine-unsupported");
  });
  it("does not exempt app failures, setup failures, missing caches or timeouts", () => {
    for (const change of [{ appCode: true }, { controlled: false }, { cached: false }, { onlineReload: false }, { stage: "online" }, { error: "page.reload: Timeout 15000ms exceeded" }]) {
      expect(classify({ ...prepared, error: internalError, ...change })).toBe("unexpected-failure");
    }
  });
  it("rejects missing offline content and incomplete evidence", () => {
    expect(classify({ ...prepared, offlineReload: "missing" })).toBe("unexpected-failure");
    expect(classify({ error: internalError })).toBe("unexpected-failure");
  });
});
