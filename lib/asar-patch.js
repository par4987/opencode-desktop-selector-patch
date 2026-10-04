/**
 * lib/asar-patch.js — core logic for the OpenCode Desktop model selector patch.
 *
 * The Desktop UI is a compiled bundle inside `resources/app.asar`. Every edit
 * below replaces a byte string with another of the IDENTICAL length, so:
 *   - the archive keeps its exact size and internal offsets, and
 *   - no re-packing is required (the bundle stays a valid asar).
 *
 * Safety invariants:
 *   - Every pattern must match EXACTLY once, otherwise nothing is written.
 *   - A backup (`app.asar.orig`) is taken before the first write.
 *   - After writing, the file is re-read and every edit is re-verified.
 * If a future Desktop release changes the markup, no pattern matches and the
 * tool refuses to touch the file (exit code 3) instead of corrupting it.
 */

const fs = require("fs");
const path = require("path");
const os = require("os");

/** The six edits. `old` and `neu` MUST have the same byte length. */
const EDITS = [
  {
    what: "model selector popover width 284px -> 560px",
    old: ".w-\\[284px\\]{width:284px}",
    neu: ".w-\\[284px\\]{width:560px}",
  },
  {
    what: "model selector popover list height 220px -> 60vh",
    old: ".max-h-\\[220px\\]{max-height:220px}",
    neu: ".max-h-\\[220px\\]{max-height:60vh;}",
  },
  {
    // `large` -> `x-large` is 5 chars shorter, so the class name absorbs the
    // difference (`dialog` -> `dial`). The dialog keeps the same class hook.
    what: '"Manage models" dialog large -> x-large',
    old: "size:`large`,variant:`settings`,class:`settings-manage-models-dialog`",
    neu: "size:`x-large`,variant:`settings`,class:`settings-manage-models-dial`",
  },
  {
    what: "settings panel scrollbar-width none -> auto",
    old: ".settings-panel{scrollbar-width:none",
    neu: ".settings-panel{scrollbar-width:auto",
  },
  {
    // Deliberately invalid selector: the rule never matches, which neutralises
    // the `display:none` scrollbar rule without enabling the compat flag.
    what: "settings panel: neutralise hidden webkit scrollbar",
    old: ".settings-panel::-webkit-scrollbar{display:none}",
    neu: ".settings-panel::-webkit-scr0llbar{display:none}",
  },
  {
    what: "model names: nowrap -> normal (no ellipsis truncation)",
    old: ".settings-models [data-slot=settings-row-title]{text-overflow:ellipsis;white-space:nowrap;",
    neu: ".settings-models [data-slot=settings-row-title]{text-overflow:ellipsis;white-space:normal;",
  },
];

/** Locations where the Windows Desktop app is normally installed. */
function candidateAsarPaths() {
  const local = process.env.LOCALAPPDATA || path.join(os.homedir(), "AppData", "Local");
  const programFiles = process.env.ProgramFiles || "C:\\Program Files";
  const programFilesX86 = process.env["ProgramFiles(x86)"] || "C:\\Program Files (x86)";
  return [
    path.join(local, "Programs", "@opencodedesktop", "resources", "app.asar"),
    path.join(local, "Programs", "opencode", "resources", "app.asar"),
    path.join(programFiles, "@opencodedesktop", "resources", "app.asar"),
    path.join(programFiles, "OpenCode", "resources", "app.asar"),
    path.join(programFilesX86, "@opencodedesktop", "resources", "app.asar"),
  ];
}

/**
 * Resolve app.asar. Precedence: explicit arg > OPENCODE_ASAR > auto-detect.
 * @param {string} [explicit] path passed with --asar
 * @returns {string} absolute path to app.asar
 */
function resolveAsar(explicit) {
  if (explicit) return path.resolve(explicit);
  if (process.env.OPENCODE_ASAR) return path.resolve(process.env.OPENCODE_ASAR);

  const found = candidateAsarPaths().find((p) => fs.existsSync(p));
  if (!found) {
    throw new Error(
      "Could not find app.asar automatically.\n" +
        "Looked in:\n  " +
        candidateAsarPaths().join("\n  ") +
        "\nPass --asar <path> or set OPENCODE_ASAR."
    );
  }
  return found;
}

function count(buf, str) {
  const needle = Buffer.from(str, "latin1");
  let c = 0;
  let i = -1;
  while ((i = buf.indexOf(needle, i + 1)) !== -1) c++;
  return c;
}

/**
 * Inspect the archive without writing anything.
 * @returns {{status:'applied'|'original'|'mixed'|'unknown', edits:Array}}
 *   per edit: APPLIED (patched form present, original absent),
 *   ORIGINAL (only the unpatched form present),
 *   UNKNOWN (neither form found -> markup changed in this release)
 */
function inspect(asar) {
  const buf = fs.readFileSync(asar);
  const edits = EDITS.map((e) => {
    const before = count(buf, e.old);
    const after = count(buf, e.neu);
    let status;
    if (after === 1 && before === 0) status = "APPLIED";
    else if (before === 1 && after === 0) status = "ORIGINAL";
    else status = "UNKNOWN";
    return { what: e.what, status, before, after };
  });
  const applied = edits.filter((e) => e.status === "APPLIED").length;
  const original = edits.filter((e) => e.status === "ORIGINAL").length;
  const unknown = edits.filter((e) => e.status === "UNKNOWN").length;
  let status = "unknown";
  if (unknown > 0) status = "unknown";
  else if (original === 0 && applied > 0) status = "applied";
  else if (original > 0 && applied === 0) status = "original";
  else status = "mixed";
  return { status, edits, size: buf.length };
}

/**
 * Apply the patch (idempotent). Returns {changed, applied:[], already:[], createdBackup}
 * @param {string} asar
 */
function apply(asar) {
  if (!fs.existsSync(asar)) throw new Error("Not found: " + asar);

  const bak = asar + ".orig";
  let createdBackup = false;
  if (!fs.existsSync(bak)) {
    fs.copyFileSync(asar, bak);
    createdBackup = true;
  }

  const buf = fs.readFileSync(asar);
  const size = buf.length;

  // Validate everything BEFORE writing a single byte.
  const plan = [];
  const already = [];
  for (const e of EDITS) {
    const oldB = Buffer.from(e.old, "latin1");
    const newB = Buffer.from(e.neu, "latin1");
    if (oldB.length !== newB.length) {
      throw new Error(`Length mismatch for [${e.what}]: ${oldB.length} vs ${newB.length} bytes`);
    }
    const before = count(buf, e.old);
    const after = count(buf, e.neu);
    if (after === 1 && before === 0) {
      already.push(e.what);
      continue;
    }
    if (before !== 1 || after !== 0) {
      throw new Error(
        `Pattern check failed for [${e.what}]: found ${before} original / ${after} patched (expected 1/0).\n` +
          "This Desktop release likely changed the markup. Nothing was written."
      );
    }
    plan.push(e);
  }

  if (plan.length === 0) {
    return { changed: false, applied: [], already, createdBackup };
  }

  for (const e of plan) {
    const idx = buf.indexOf(Buffer.from(e.old, "latin1"));
    Buffer.from(e.neu, "latin1").copy(buf, idx);
  }
  if (buf.length !== size) throw new Error(`Size changed ${size} -> ${buf.length}`);

  const fd = fs.openSync(asar, "r+");
  try {
    fs.writeSync(fd, buf, 0, buf.length, 0);
  } finally {
    fs.closeSync(fd);
  }

  // Re-read and verify.
  const check = fs.readFileSync(asar);
  if (check.length !== size) throw new Error(`Verification failed: size is now ${check.length}`);
  for (const e of plan) {
    if (count(check, e.old) !== 0 || count(check, e.neu) !== 1) {
      throw new Error("Verification failed for: " + e.what);
    }
  }
  return { changed: true, applied: plan.map((e) => e.what), already, createdBackup };
}

/** Restore the unpatched backup. Refuses when sizes do not match. */
function restore(asar) {
  const bak = asar + ".orig";
  if (!fs.existsSync(bak)) throw new Error("No backup found: " + bak);
  const bakBuf = fs.readFileSync(bak);
  const cur = fs.readFileSync(asar);
  if (bakBuf.length !== cur.length) {
    throw new Error(
      `Size mismatch, aborting restore (the current asar is not the patched one):\n` +
        `  backup: ${bakBuf.length} bytes\n  current: ${cur.length} bytes`
    );
  }
  const fd = fs.openSync(asar, "r+");
  try {
    fs.writeSync(fd, bakBuf, 0, bakBuf.length, 0);
  } finally {
    fs.closeSync(fd);
  }
  return { size: bakBuf.length };
}

module.exports = { EDITS, resolveAsar, candidateAsarPaths, inspect, apply, restore };