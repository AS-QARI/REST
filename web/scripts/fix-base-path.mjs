#!/usr/bin/env node
// vinext's static export ("output: export") does not correctly apply Next's
// `basePath` option (the RSC prerenderer 404s when both are combined), so the
// build runs without basePath and this script rewrites the emitted
// domain-root-absolute asset references ("/assets/...") to live under
// BASE_PATH afterwards, matching where GitHub Pages actually serves the site.
import { readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";

const BASE_PATH = "/REST";
const DIST_DIR = join(process.cwd(), "dist", "client");
const TEXT_EXTENSIONS = new Set([".html", ".rsc", ".js", ".css", ".webmanifest", ".json", ".svg"]);

let filesPatched = 0;

function walk(dir) {
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    const fullPath = join(dir, entry.name);
    if (entry.isDirectory()) {
      walk(fullPath);
      continue;
    }
    if (!TEXT_EXTENSIONS.has(extname(entry.name))) continue;
    const content = readFileSync(fullPath, "utf8");
    // Domain-root-absolute refs in HTML/RSC/CSS (href="/assets/...", import("/assets/...")).
    let patched = content.split("/assets/").join(`${BASE_PATH}/assets/`);
    // Vite's __vite__mapDeps prefetch arrays store bare "assets/..." entries that get
    // concatenated with Vite's own (unconfigured, default "/") base at runtime — prefixing
    // the base path onto the relative string itself corrects that concatenation too.
    patched = patched.split('"assets/').join(`"${BASE_PATH.slice(1)}/assets/`);
    if (patched !== content) {
      writeFileSync(fullPath, patched);
      filesPatched += 1;
    }
  }
}

walk(DIST_DIR);
console.log(`fix-base-path: patched ${filesPatched} file(s) under dist/client to use ${BASE_PATH}/assets/`);
