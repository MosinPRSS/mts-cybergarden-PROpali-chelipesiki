import assert from "node:assert/strict";
import { readdir, readFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = fileURLToPath(new URL("../src/", import.meta.url));
const allowed = {
  domain: new Set(["domain"]),
  application: new Set(["application", "domain"]),
  infrastructure: new Set(["infrastructure", "application", "domain"]),
  presentation: new Set(["presentation", "application", "domain", "data"]),
};

test("dependencies point inward and UI cannot access HTTP/storage adapters directly", async () => {
  const entries = await readdir(root, { recursive: true, withFileTypes: true });
  for (const entry of entries) {
    if (!entry.isFile() || !/\.tsx?$/.test(entry.name)) continue;
    const file = path.join(entry.parentPath, entry.name);
    const layer = path.relative(root, file).split(path.sep)[0];
    if (!allowed[layer]) continue;
    const source = await readFile(file, "utf8");
    for (const match of source.matchAll(/(?:from\s*|import\s*)["']([^"']+)["']/g)) {
      const specifier = match[1];
      if (!specifier.startsWith(".")) {
        assert.notEqual(layer, "domain", `Domain imports external dependency: ${file} -> ${specifier}`);
        continue;
      }
      const target = path.resolve(path.dirname(file), specifier);
      const targetLayer = path.relative(root, target).split(path.sep)[0];
      assert.ok(allowed[layer].has(targetLayer), `${file} imports forbidden layer: ${specifier}`);
    }
    if (layer === "domain" || layer === "application") {
      assert.doesNotMatch(source, /\b(?:window|document|localStorage|EventSource|fetch)\b/,
        `Browser APIs must stay in adapters or UI: ${file}`);
    }
  }
});
