import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { chmodSync, symlinkSync, writeFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { after, describe, it } from "node:test";
import { fileURLToPath } from "node:url";
import { cleanup, makeTempDir } from "./helpers.js";

const BIN = join(dirname(fileURLToPath(import.meta.url)), "..", "bin", "bt-triage.js");

const dirs = [];
function tmp() {
  const d = makeTempDir("bt-triage-entry-");
  dirs.push(d);
  return d;
}
after(() => {
  for (const d of dirs) cleanup(d);
});

function run(args) {
  try {
    const stdout = execFileSync(process.execPath, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    return {
      code: err.status ?? 1,
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
    };
  }
}

/** Execute a file directly, so the shebang is used instead of an explicit node call. */
function runDirect(file, args) {
  try {
    const stdout = execFileSync(file, args, {
      encoding: "utf8",
      stdio: ["ignore", "pipe", "pipe"],
    });
    return { code: 0, stdout, stderr: "" };
  } catch (err) {
    if (err.code === "EACCES" || err.code === "ENOEXEC") return { skipped: true };
    return {
      code: err.status ?? 1,
      stdout: err.stdout?.toString() ?? "",
      stderr: err.stderr?.toString() ?? "",
    };
  }
}

describe("cli entry point", () => {
  it("runs when the CLI is started through a symlink", () => {
    const link = join(tmp(), "bt-triage");
    symlinkSync(BIN, link);

    const result = run([link, "--version"]);
    assert.equal(result.code, 0, `expected exit code 0, got ${result.code}`);
    assert.match(result.stdout, /^bt-triage v\d+\.\d+\.\d+/);
    assert.match(result.stdout, /bt-triage v0\.1\.0/);
  });

  it("runs when the symlink is executed directly through its shebang", () => {
    const link = join(tmp(), "bt-triage");
    symlinkSync(BIN, link);
    try {
      chmodSync(link, 0o755);
    } catch {
      // The symlink itself cannot always be chmod-ed; the target decides.
    }

    const result = runDirect(link, ["--version"]);
    if (result.skipped) return; // The temp filesystem does not allow execution.
    assert.equal(result.code, 0, `expected exit code 0, got ${result.code}`);
    assert.match(result.stdout, /bt-triage v0\.1\.0/);
  });

  it("runs through a relative symlink as well", () => {
    const dir = tmp();
    const link = join(dir, "bt-triage");
    symlinkSync(relative(dir, BIN), link);

    const result = run([link, "--version"]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /bt-triage v0\.1\.0/);
  });

  it("still runs when the real file is executed directly", () => {
    const result = run([BIN, "--version"]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /bt-triage v0\.1\.0/);
  });

  it("does not run the CLI when the module is imported", () => {
    const importer = join(tmp(), "importer.mjs");
    const source = [
      `import { version } from ${JSON.stringify(BIN)};`,
      `console.log("imported:" + version);`,
      "",
    ].join("\n");
    writeFileSync(importer, source, "utf8");

    const result = run([importer]);
    assert.equal(result.code, 0);
    assert.match(result.stdout, /^imported:0\.1\.0/);
    assert.doesNotMatch(result.stdout, /^bt-triage v/m);
  });
});
