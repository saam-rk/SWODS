import { copyFile, mkdir, stat } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { validatePublication } from "./validate-publication.mjs";

try {
  const files = await validatePublication();
  const destination = resolve("dist/SWODS-public");
  let exists = true;
  try { await stat(destination); } catch (error) { if (error.code === "ENOENT") exists = false; else throw error; }
  if (exists) throw new Error("dist/SWODS-public already exists. Move the previous export aside; this command will not overwrite it.");
  await mkdir(destination, { recursive: true });
  for (const path of files) {
    const output = resolve(destination, path);
    await mkdir(dirname(output), { recursive: true });
    await copyFile(resolve(path), output);
  }
  await validatePublication(destination);
  console.log(`Exported ${files.length} reviewed source files to ${destination}. No Git history, credentials, dependency directories or build/test artifacts were copied.`);
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exitCode = 1;
}
