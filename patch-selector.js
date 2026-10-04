#!/usr/bin/env node
/**
 * patch-selector.js — widen the model selector in OpenCode Desktop (Windows).
 *
 *   node patch-selector.js                apply the patch (idempotent)
 *   node patch-selector.js check          report status, never writes
 *   node patch-selector.js restore        restore the unpatched backup
 *   node patch-selector.js --asar <path>  use an explicit app.asar
 *
 * Restart OpenCode Desktop after a successful apply: Electron caches the
 * bundle at startup, so a running app keeps the old styles until it relaunches.
 *
 * Exit codes: 0 ok · 1 error · 2 check found pending edits · 3 patterns unknown
 */
const { resolveAsar, inspect, apply, restore } = require("./lib/asar-patch")

function arg(name) {
  const i = process.argv.indexOf(name)
  return i >= 0 && process.argv[i + 1] ? process.argv[i + 1] : undefined
}

function printInspect(r) {
  const w = Math.max(...r.edits.map((e) => e.what.length));
  console.log("asar: " + r.size + " bytes");
  for (const e of r.edits) {
    console.log("  " + e.status.padEnd(9) + e.what.padEnd(w) + `  (original=${e.before} patched=${e.after})`);
  }
}

function main() {
  const command = process.argv[2] && !process.argv[2].startsWith("--") ? process.argv[2] : "apply";
  const asar = resolveAsar(arg("--asar"));

  if (command === "check") {
    const r = inspect(asar);
    console.log("Status: " + r.status.toUpperCase() + "  (" + asar + ")");
    printInspect(r);
    if (r.status === "unknown") {
      console.log("\nSome patterns match neither form: this release changed the markup.");
      console.log("Nothing to do here; see README 'Troubleshooting'.");
      process.exit(3);
    }
    process.exit(r.status === "applied" ? 0 : 2);
  }

  if (command === "restore") {
    const r = restore(asar);
    console.log("Restored from " + asar + ".orig (" + r.size + " bytes).");
    console.log("Restart OpenCode Desktop to see the unpatched UI.");
    return;
  }

  if (command !== "apply") {
    console.error("Unknown command: " + command);
    console.error("Usage: node patch-selector.js [apply|check|restore] [--asar <path>]");
    process.exit(1);
  }

  const before = inspect(asar);
  if (before.status === "unknown") {
    console.error("Refusing to write: some patterns match neither the original nor the patched form.");
    console.error("This Desktop release changed the markup — nothing was modified.");
    process.exit(3);
  }

  const res = apply(asar);
  if (res.createdBackup) console.log("Backup created: " + asar + ".orig");
  if (!res.changed) {
    console.log("Already patched (" + res.already.length + "/" + require("./lib/asar-patch").EDITS.length + " edits). Nothing to do.");
    return;
  }
  console.log("Patched " + res.applied.length + " edits:");
  for (const w of res.applied) console.log("  - " + w);
  console.log("\nRestart OpenCode Desktop for the changes to take effect.");
}

try {
  main();
} catch (e) {
  console.error("ERROR: " + (e && e.message ? e.message : e));
  process.exit(1);
}