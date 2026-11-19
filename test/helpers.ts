import { readFileSync, readdirSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

export const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
export const readJson = <T = any>(rel: string): T => JSON.parse(readFileSync(join(ROOT, rel), "utf8"));
export const listDir = (rel: string) => readdirSync(join(ROOT, rel));
