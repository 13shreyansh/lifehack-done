import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { spawnSync } from "node:child_process";

const repoRoot = resolve(new URL("..", import.meta.url).pathname);
const outputDirectory = mkdtempSync(join(tmpdir(), "done-merchant-tests-"));
const nodeBinary = process.execPath;

try {
  const compile = spawnSync(nodeBinary, [
    join(repoRoot, "node_modules/typescript/bin/tsc"),
    "--target", "ES2022",
    "--module", "commonjs",
    "--moduleResolution", "node",
    "--esModuleInterop",
    "--skipLibCheck",
    "--outDir", outputDirectory,
    join(repoRoot, "tests/merchant-import.test.ts"),
    join(repoRoot, "lib/merchant/importer.ts"),
    join(repoRoot, "lib/merchant/types.ts"),
    join(repoRoot, "lib/merchant/safe-fetch.ts"),
  ], { cwd: repoRoot, encoding: "utf8" });

  if (compile.status !== 0) {
    process.stderr.write(compile.stdout);
    process.stderr.write(compile.stderr);
    process.exitCode = compile.status ?? 1;
  } else {
    const run = spawnSync(nodeBinary, ["--test", join(outputDirectory, "tests/merchant-import.test.js")], {
      cwd: repoRoot,
      encoding: "utf8",
      stdio: "inherit",
    });
    process.exitCode = run.status ?? 1;
  }
} finally {
  rmSync(outputDirectory, { recursive: true, force: true });
}

