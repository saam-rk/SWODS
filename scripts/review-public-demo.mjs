import { spawn, spawnSync } from "node:child_process";
import { mkdir, writeFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "@playwright/test";
import AxeBuilder from "@axe-core/playwright";

// Requires a fresh build:demo; uses a separate local port and clean browser contexts.
const port = 3101;
const origin = `http://127.0.0.1:${port}`;
const server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "start", "--hostname", "127.0.0.1", "--port", String(port)], { stdio: "inherit" });
let browser;
try {
  let ready = false;
  for (let attempt = 0; attempt < 120; attempt++) {
    if (server.exitCode !== null) throw new Error("Local review server exited before startup");
    try { ready = (await fetch(`${origin}/api/health`)).ok; } catch { ready = false; }
    if (ready) break;
    await delay(500);
  }
  if (!ready) throw new Error("Local review server did not become ready");
  await mkdir("audit-artifacts/public-edition", { recursive: true });
  browser = await chromium.launch();
  const checks = [];
  for (const [name, width, height] of [["phone", 375, 812], ["desktop", 1440, 1000]]) {
    const context = await browser.newContext({ viewport: { width, height }, locale: "en-US", reducedMotion: "reduce", serviceWorkers: "block" });
    const page = await context.newPage();
    for (const route of ["/", "/join"]) {
      await page.goto(`${origin}${route}`);
      await page.evaluate(() => document.fonts.ready);
      if (route === "/") await page.locator(".landing-page__image").evaluate((image) => {
        if (!(image instanceof HTMLImageElement) || !image.complete || image.naturalWidth === 0) throw new Error("Missing original landing artwork");
      });
      else await page.getByLabel("First name").waitFor();
      const label = route === "/" ? "landing" : "join";
      await page.screenshot({ path: `audit-artifacts/public-edition/${name}-${label}.png`, fullPage: true });
      const result = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21aa"]).analyze();
      checks.push({ viewport: name, route, violations: result.violations.map(({ id, impact, nodes }) => ({ id, impact, targets: nodes.map((node) => node.target) })) });
    }
    await context.close();
  }
  await writeFile("audit-artifacts/public-edition/accessibility.json", JSON.stringify(checks, null, 2) + "\n");
  if (checks.some((check) => check.violations.length > 0)) throw new Error("Accessibility findings require review; see generated accessibility.json");
  console.log("Four clean-demo screenshots captured; four automated accessibility scans have no violations. Generated evidence is not exported.");
  await browser.close();
  browser = undefined;
  const images = spawnSync(process.execPath, ["scripts/audit-images.mjs"], { env: { ...process.env, SWODS_AUDIT_ORIGIN: origin }, stdio: "inherit", timeout: 120000 });
  if (images.error) throw images.error;
  if (images.status !== 0) throw new Error("Image processing audit failed");
} finally {
  if (browser) await browser.close();
  server.kill();
}
