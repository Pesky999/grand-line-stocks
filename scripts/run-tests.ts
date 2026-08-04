import { spawnSync } from "node:child_process";
import { readdir } from "node:fs/promises";
import { join } from "node:path";
import { fileURLToPath } from "node:url";

const projectRoot = fileURLToPath(new URL("../", import.meta.url));
const sourceRoot = join(projectRoot, "src");

async function findTests(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const tests = await Promise.all(
    entries.map(async (entry) => {
      const path = join(directory, entry.name);
      if (entry.isDirectory()) return findTests(path);
      return entry.isFile() && entry.name.endsWith(".test.ts") ? [path] : [];
    }),
  );

  return tests.flat();
}

const testFiles = (await findTests(sourceRoot)).sort();

if (testFiles.length === 0) {
  throw new Error("No src/**/*.test.ts files were found.");
}

const result = spawnSync(process.execPath, ["--test", "--experimental-strip-types", ...testFiles], {
  cwd: projectRoot,
  stdio: "inherit",
});

if (result.error) {
  throw result.error;
}

process.exit(result.status ?? 1);
