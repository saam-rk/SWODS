import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import sharp from "sharp";

// Original geometric artwork: no photographs, external files, fonts or network inputs.
const frame = (x, y, width, height, color, motif) => `<g transform="translate(${x} ${y})"><rect width="${width}" height="${height}" fill="${color}"/><rect x="12" y="12" width="${width - 24}" height="${height - 24}" fill="none" stroke="#fff3d6" stroke-opacity=".35"/>${motif}</g>`;
const artwork = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 1000">
  <title>Shared field — an original geometric contact sheet</title>
  <rect width="1600" height="1000" fill="#2b1007"/>
  ${frame(-40, -20, 440, 500, "#7a300f", '<path d="M0 370 440 90v140L0 500z" fill="#d99748"/><path d="M60 0v500M190 0v500M320 0v500" stroke="#f1dfb3" stroke-opacity=".2"/>')}
  ${frame(418, -20, 550, 280, "#ae8258", '<circle cx="330" cy="135" r="110" fill="#2b150b"/><circle cx="330" cy="135" r="76" fill="none" stroke="#f1dfb3" stroke-width="2"/>')}
  ${frame(986, -20, 660, 500, "#572007", '<path d="M0 410 190 200l170 150L660 60v440H0z" fill="#836953"/><path d="M0 445 210 285l150 150L660 180" fill="none" stroke="#d99748" stroke-width="8"/>')}
  ${frame(418, 278, 550, 380, "#6d5039", '<path d="M0 190h550M0 210h550M0 240h550M0 285h550" stroke="#f1dfb3" stroke-opacity=".5"/><circle cx="275" cy="170" r="80" fill="#d99748"/>')}
  ${frame(-40, 498, 440, 540, "#3f633e", '<path d="M20 540 250 0M125 540 355 0M230 540 460 0" stroke="#f1dfb3" stroke-width="38" stroke-opacity=".3"/>')}
  ${frame(418, 676, 550, 362, "#7a300f", '<path d="M70 0v362M130 0v362M190 0v362M250 0v362M310 0v362M370 0v362M430 0v362" stroke="#d99748" stroke-width="18"/>')}
  ${frame(986, 498, 660, 540, "#ae8258", '<circle cx="345" cy="290" r="230" fill="none" stroke="#2b150b" stroke-width="35"/><circle cx="345" cy="290" r="155" fill="none" stroke="#2b150b" stroke-width="20"/><circle cx="345" cy="290" r="85" fill="#d99748"/>')}
  <rect width="1600" height="1000" fill="#2b1007" opacity=".15"/>
</svg>\n`;
const icon = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><title>SWODS mosaic mark</title><rect width="512" height="512" fill="#2b1007"/><g fill="#fff3d6"><path d="M112 132h88v88h-88zM212 132h88v88h-88zM312 132h88v88h-88zM112 232h88v88h-88zM212 232h88v88h-88zM312 232h88v88h-88z"/></g><path d="M112 132h88v88h-88zM212 232h88v88h-88z" fill="#d99748"/></svg>\n`;
const target = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1200 800"><title>Synthetic mosaic target — not a photograph</title><rect width="1200" height="800" fill="#f1dfb3"/><path d="M0 540 250 300l220 130 240-280 240 180 250-130v600H0z" fill="#3f633e"/><path d="M0 670 250 520l220 110 240-160 240 130 250-90v290H0z" fill="#7a300f"/><circle cx="950" cy="150" r="70" fill="#d99748"/><path d="M70 80h110M70 80v110M1130 720h-110M1130 720V610" fill="none" stroke="#2b150b" stroke-width="6"/></svg>\n`;
await mkdir("public", { recursive: true });
await mkdir("docs", { recursive: true });
for (const [name, content] of Object.entries({
  "shared-field.svg": artwork,
  "icon.svg": icon,
  "favicon.svg": icon,
  "demo-target.svg": target,
})) await writeFile(`public/${name}`, content);
for (const size of [192, 512]) await sharp(Buffer.from(icon)).resize(size, size).png().toFile(`public/icon-${size}.png`);
const files = ["shared-field.svg", "icon.svg", "favicon.svg", "demo-target.svg", "icon-192.png", "icon-512.png"];
const assets = await Promise.all(files.map(async (name) => ({
  path: `public/${name}`,
  sha256: createHash("sha256").update(await readFile(`public/${name}`)).digest("hex"),
  origin: "Original deterministic geometry in scripts/generate-public-assets.mjs; no third-party media inputs",
  license: "MIT",
})));
await writeFile("docs/ASSET_MANIFEST.json", JSON.stringify({ schemaVersion: 1, assets }, null, 2) + "\n");
console.log(`Generated ${files.length} original public assets and their SHA-256 manifest.`);
