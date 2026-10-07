// Standalone engine probe: no Next.js, Supabase or SWODS application code.
import { createServer } from "node:http";
import { mkdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { webkit } from "@playwright/test";

export async function probeWebkitOffline() {
  const server = createServer((request, response) => {
    if (request.url === "/sw.js") {
      response.setHeader("Content-Type", "application/javascript");
      response.end("self.addEventListener('install',e=>e.waitUntil(caches.open('probe').then(c=>c.add('/')).then(()=>self.skipWaiting())));self.addEventListener('activate',e=>e.waitUntil(self.clients.claim()));self.addEventListener('fetch',e=>e.respondWith(caches.match('/')));");
    } else {
      response.setHeader("Content-Type", "text/html");
      response.end('<h1>Offline probe</h1><script>navigator.serviceWorker.register("/sw.js")</script>');
    }
  });
  let browser;
  const evidence = { platform: process.platform, appCode: false, stage: "startup" };
  try {
    await new Promise((accept, reject) => {
      server.once("error", reject);
      server.listen(0, "127.0.0.1", accept);
    });
    const address = server.address();
    if (!address || typeof address === "string") throw new Error("No probe server address");
    browser = await webkit.launch();
    evidence.browser = browser.version();
    const context = await browser.newContext({ serviceWorkers: "allow" });
    const page = await context.newPage();
    page.setDefaultNavigationTimeout(15000);
    evidence.stage = "online";
    await page.goto(`http://127.0.0.1:${address.port}`);
    await page.evaluate(() => navigator.serviceWorker.ready.then(() => true));
    await page.reload();
    await page.waitForFunction(() => Boolean(navigator.serviceWorker.controller));
    evidence.controlled = await page.evaluate(() => Boolean(navigator.serviceWorker.controller));
    evidence.cached = await page.evaluate(async () => Boolean(await caches.match("/")));
    evidence.onlineReload = await page.getByRole("heading", { name: "Offline probe" }).isVisible();
    evidence.stage = "offline-reload";
    await context.setOffline(true);
    await page.reload();
    evidence.offlineReload = await page.getByRole("heading", { name: "Offline probe" }).isVisible() ? "passed" : "missing";
  } catch (error) {
    evidence.error = error instanceof Error ? error.message : String(error);
  } finally {
    if (browser) await browser.close();
    if (server.listening) await new Promise((accept, reject) => server.close((error) => error ? reject(error) : accept()));
  }
  return evidence;
}

export function classifyWebkitOffline(evidence) {
  const prepared = evidence.appCode === false && evidence.controlled === true
    && evidence.cached === true && evidence.onlineReload === true && evidence.stage === "offline-reload";
  if (prepared && evidence.offlineReload === "passed" && !evidence.error) return "supported";
  if (prepared && /^page\.reload: WebKit encountered an internal error(?:\n|$)/.test(evidence.error ?? "")) return "engine-unsupported";
  return "unexpected-failure";
}

export async function recordWebkitOfflineCapability() {
  const first = await probeWebkitOffline();
  const attempts = [first];
  let capability = classifyWebkitOffline(first);
  // Exemption needs the exact engine failure twice, never merely an app failure or timeout.
  if (capability === "engine-unsupported") {
    const second = await probeWebkitOffline();
    attempts.push(second);
    if (classifyWebkitOffline(second) !== "engine-unsupported") capability = "unexpected-failure";
  }
  await mkdir("audit-artifacts/after", { recursive: true });
  await writeFile("audit-artifacts/after/webkit-offline-probe.json", JSON.stringify({ capability, attempts }, null, 2) + "\n");
  return capability;
}

if (resolve(process.argv[1] ?? "") === fileURLToPath(import.meta.url)) {
  const capability = await recordWebkitOfflineCapability();
  console.log(`Independent WebKit offline capability: ${capability}; evidence under audit-artifacts/after.`);
  if (capability === "unexpected-failure") process.exitCode = 1;
}
