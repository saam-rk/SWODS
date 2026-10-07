const baseUrl = process.argv[2] ?? process.env.PRODUCTION_URL;

if (!baseUrl) {
  console.error("Usage: node scripts/smoke-production.mjs <base-url>");
  process.exit(1);
}

const origin = parseOrigin(baseUrl);
const checks = [
  { path: "/api/health", contentType: "application/json" },
  { path: "/api/health/ready", contentType: "application/json" },
  { path: "/", contentType: "text/html", securityHeaders: true },
  { path: "/manifest.webmanifest", contentType: "application/manifest+json" },
  { path: "/sw.js", contentType: "application/javascript" },
];

let failed = false;
for (const check of checks) {
  try {
    const response = await fetch(new URL(check.path, origin), {
      redirect: "error",
      signal: AbortSignal.timeout(10_000),
    });
    const receivedType = response.headers.get("content-type") ?? "";
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    if (!receivedType.includes(check.contentType)) {
      throw new Error(`expected ${check.contentType}, received ${receivedType || "no content type"}`);
    }
    if (check.securityHeaders) assertSecurityHeaders(response.headers);
    console.log(`PASS ${check.path}`);
  } catch (error) {
    failed = true;
    console.error(`FAIL ${check.path}: ${error instanceof Error ? error.message : String(error)}`);
  }
}

if (failed) process.exitCode = 1;

function parseOrigin(value) {
  let url;
  try {
    url = new URL(value);
  } catch {
    console.error("The base URL must be an absolute URL.");
    process.exit(1);
  }

  if (url.protocol !== "https:" && !["localhost", "127.0.0.1"].includes(url.hostname)) {
    console.error("The production URL must use HTTPS.");
    process.exit(1);
  }
  return url;
}

function assertSecurityHeaders(headers) {
  for (const name of [
    "content-security-policy",
    "permissions-policy",
    "referrer-policy",
    "x-content-type-options",
    "x-frame-options",
  ]) {
    if (!headers.has(name)) throw new Error(`missing ${name} header`);
  }
}
