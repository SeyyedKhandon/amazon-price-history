// Bundles the TypeScript entry points and copies the static files into dist/, which is the extension
// Chrome loads. Usage: node scripts/build.mjs [--watch]
import { build, context } from "esbuild";
import { cp, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const dist = join(root, "dist");
const watch = process.argv.includes("--watch");

/** One bundle per place the browser runs our code; the names match manifest.json. */
const entryPoints = ["background", "popup", "content", "search"].map((name) => `src/${name}.ts`);

/** Files copied into dist/ as they are. */
const staticFiles = ["manifest.json", "popup.html", "content.css", "search.css", "icons"];

const options = {
  absWorkingDir: root,
  entryPoints,
  outdir: "dist",
  bundle: true,
  format: "iife", // content scripts can't use modules
  target: "chrome110",
  legalComments: "none",
  logLevel: "info",
  // Deliberately not minified: the Chrome Web Store reviews the code, and readable output is easier to review.
  minify: false,
};

/** Copies the static files and stamps the version from package.json into the manifest, so they can't drift. */
async function copyStatic() {
  for (const file of staticFiles) await cp(join(root, file), join(dist, file), { recursive: true });
  const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
  const manifestPath = join(dist, "manifest.json");
  const manifest = JSON.parse(await readFile(manifestPath, "utf8"));
  manifest.version = version;
  await writeFile(manifestPath, JSON.stringify(manifest, null, 2) + "\n");
}

await rm(dist, { recursive: true, force: true });
await mkdir(dist, { recursive: true });

if (watch) {
  const ctx = await context(options);
  await copyStatic();
  await ctx.watch();
  console.log("Watching src/ ... (changes to manifest, popup.html, CSS or icons need a rebuild)");
} else {
  await build(options);
  await copyStatic();
}
