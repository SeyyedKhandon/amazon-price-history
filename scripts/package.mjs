// Zips dist/ into release/toolbox-for-amazon-<version>.zip, the file to upload to the Chrome Web Store.
// Run via `npm run package` (which type-checks and builds first). Needs the `zip` command.
import { execFileSync } from "node:child_process";
import { mkdir, readFile, rm } from "node:fs/promises";
import { fileURLToPath } from "node:url";
import { join } from "node:path";

const root = fileURLToPath(new URL("..", import.meta.url));
const { version } = JSON.parse(await readFile(join(root, "package.json"), "utf8"));
const out = join(root, "release", `toolbox-for-amazon-${version}.zip`);

await mkdir(join(root, "release"), { recursive: true });
await rm(out, { force: true });
execFileSync("zip", ["-q", "-r", out, ".", "-x", "*.DS_Store"], { cwd: join(root, "dist") });
console.log(`Created ${out}`);
