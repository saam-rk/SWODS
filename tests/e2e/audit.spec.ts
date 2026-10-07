import { expect, test, type Page } from "@playwright/test";

async function join(page: Page) {
  await page.goto("/join");
  await expect(page.getByLabel("First name")).toBeEnabled();
  await page.getByLabel("First name").fill("Audit");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
  await page.getByRole("button", { name: "See the prompts" }).click();
  await expect(page).toHaveURL(/\/challenges$/);
}

async function admin(page: Page) {
  await page.goto("/admin");
  await expect(page.getByLabel("Administrator code").or(page.getByRole("heading", { name: "The field desk" }))).toBeVisible();
  if (await page.getByLabel("Administrator code").isVisible()) {
    await page.getByLabel("Administrator code").fill("HERVAS-ADMIN");
    await page.getByRole("button", { name: "Open administration" }).click();
  }
  await expect(page.getByRole("heading", { name: "The field desk" })).toBeVisible();
}

test("modern landing, guest guards, language and responsive widths", async ({ page }) => {
  await page.goto("/");
  await expect(page.locator(".landing-page__image")).toBeVisible();
  await expect(page.locator(".landing-page__mosaic-slot")).toBeVisible();
  for (const width of [320, 375, 768, 1440]) {
    await page.setViewportSize({ width, height: 812 });
    await expect.poll(() => page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  }
  for (const locale of ["es", "it", "en"]) {
    await page.locator(".language-switcher select").selectOption(locale);
    await expect(page.locator("html")).toHaveAttribute("lang", locale);
  }
  await page.getByRole("link", { name: "Enter the activity" }).click();
  await expect(page).toHaveURL(/\/join$/);
  for (const path of ["/gallery", "/challenges", "/explore", "/onboarding"]) {
    await page.goto(path);
    await expect(page).toHaveURL(/\/join$/);
  }
});

test("join validation, capture, gallery and leave-device", async ({ page }) => {
  await page.goto("/join");
  await expect(page.getByRole("button", { name: "Start", exact: true })).toBeEnabled();
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page.locator(".field-error")).toBeVisible();
  await join(page);
  await page.locator(".challenge-row:not([disabled])").first().click();
  const png = await page.evaluate(() => {
    const canvas = document.createElement("canvas");
    canvas.width = 120; canvas.height = 80;
    canvas.getContext("2d")!.fillRect(0, 0, 120, 80);
    return canvas.toDataURL().split(",")[1];
  });
  await page.locator('input[type="file"]').last().setInputFiles({ name: "audit.png", mimeType: "image/png", buffer: Buffer.from(png, "base64") });
  await page.locator(".capture-caption textarea").fill("A shared autumn detail");
  await page.locator(".privacy-notice button").click();
  await page.getByRole("button", { name: "Add photo" }).click();
  await expect(page.locator(".capture-panel--saved")).toBeVisible();
  await page.goto("/gallery");
  await expect(page.locator(".photo-tile")).not.toHaveCount(0);
  await page.reload();
  await expect(page.locator(".photo-tile")).toHaveCount(6);
  await page.getByRole("button", { name: /View photograph: Photograph by Audit/ }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Delete this photograph" }).click();
  await expect(page.locator(".photo-tile")).toHaveCount(5);
  await page.goto("/explore");
  await expect(page.getByRole("heading", { name: "Hi, Audit." })).toBeVisible();
  await expect(page.locator(".explore-summary")).toBeVisible();
  page.once("dialog", (dialog) => dialog.accept());
  await page.getByRole("button", { name: "Leave this device" }).click();
  await expect(page).toHaveURL(/\/join$/);
});

test("administrator can change the local event and enforce its join code", async ({ page }) => {
  await admin(page);
  await page.getByLabel("Join code").fill("AUTUMN");
  await page.getByRole("button", { name: "Save changes" }).click();
  await expect(page.locator(".admin-saved")).toBeVisible();
  await page.goto("/join");
  await expect(page.getByLabel("Join code")).toHaveValue("AUTUMN");
  await page.getByLabel("First name").fill("Visitor");
  await page.getByRole("button", { name: "Start", exact: true }).click();
  await expect(page).toHaveURL(/\/onboarding$/);
});

test.describe("production service worker", () => {
  test.use({ serviceWorkers: "allow" });
  test("caches public shell but not private routes", async ({ page, context, browserName }) => {
    test.fixme(browserName === "webkit" && process.platform === "win32", "Windows WebKit service worker offline support is unreliable.");
    await page.goto("/");
    await page.evaluate(async () => { await navigator.serviceWorker.ready; });
    await page.reload();
    await expect.poll(() => page.evaluate(() => Boolean(navigator.serviceWorker.controller))).toBe(true);
    const requests = await page.evaluate(async () => (await Promise.all((await caches.keys()).map(async (name) => (await (await caches.open(name)).keys()).map((request) => request.url)))).flat());
    expect(requests.some((url) => /\/(?:storage|auth|rest)\/v1\//.test(url) || url.includes("/admin"))).toBe(false);
    await context.setOffline(true);
    await page.reload();
    await expect(page.locator(".landing-page__mosaic-slot")).toBeVisible();
    await context.setOffline(false);
  });
});
