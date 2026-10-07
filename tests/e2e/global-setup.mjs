import { recordWebkitOfflineCapability } from "../../scripts/probe-webkit-offline.mjs";

export default async function globalSetup() {
  const capability = await recordWebkitOfflineCapability();
  if (capability === "unexpected-failure") throw new Error("Independent WebKit capability probe failed unexpectedly; see audit-artifacts/after/webkit-offline-probe.json");
  process.env.SWODS_WEBKIT_OFFLINE_CAPABILITY = capability;
  console.log(`Independent WebKit offline capability: ${capability}. Only offline reload may be exempted; shell/privacy assertions still run in every engine.`);
}
