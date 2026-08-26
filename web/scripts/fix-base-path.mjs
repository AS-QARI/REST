#!/usr/bin/env node
// vinext's static export ("output: export") does not correctly apply Next's
// `basePath` option (the RSC prerenderer 404s when both are combined), so the
// build always runs without basePath and this script rewrites the emitted
// domain-root-absolute references to live under BASE_PATH afterwards, for
// platforms that serve the site from a sub-path (GitHub Pages project
// sites). Set NEXT_PUBLIC_BASE_PATH to enable this; unset (the default) it
// no-ops, which is correct for root-hosted platforms like Netlify.
import { existsSync, readdirSync, readFileSync, writeFileSync } from "node:fs";
import { join, extname } from "node:path";

const BASE_PATH = process.env.NEXT_PUBLIC_BASE_PATH || "";
const DIST_DIR = join(process.cwd(), "dist", "client");
const TEXT_EXTENSIONS = new Set([".html", ".rsc", ".js", ".css", ".json", ".svg"]);

if (!BASE_PATH) {
  console.log("fix-base-path: NEXT_PUBLIC_BASE_PATH not set, skipping (root-hosted build)");
  process.exit(0);
}

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

// manifest.webmanifest ships as a static /public file with root-relative
// start_url/scope/icon paths — prefix those too, separately, since they
// don't match the "/assets/" pattern the walk above looks for.
const manifestPath = join(DIST_DIR, "manifest.webmanifest");
if (existsSync(manifestPath)) {
  const manifest = JSON.parse(readFileSync(manifestPath, "utf8"));
  manifest.start_url = `${BASE_PATH}${manifest.start_url}`;
  manifest.scope = `${BASE_PATH}${manifest.scope}`;
  manifest.icons = manifest.icons.map((icon) => ({ ...icon, src: `${BASE_PATH}${icon.src}` }));
  writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
  filesPatched += 1;
}

console.log(`fix-base-path: patched ${filesPatched} file(s) under dist/client to use ${BASE_PATH}/`);
