#!/usr/bin/env node
/**
 * auto-patch.js — keep the model selector patch applied across Desktop updates.
 *
 * A Desktop update replaces app.asar with the pristine bundle, which drops the
 * patch. Run this from a scheduled task (see install-task.ps1) and it will:
 *
 *   - patched already      -> do nothing, write nothing (silent)
 *   - pristine (updated)   -> refresh the stale backup, apply, log the result
 *   - markup changed       -> touch NOTHING, log NEEDS-MANUAL and exit 3
 *
 * Logging only happens on state changes, so a 5-minute schedule does not fill
 * the log with noise.
 *
 * Env:
 *   OPENCODE_ASAR  explicit app.asar path (default: auto-detect)
 *   OCSP_LOG_DIR   log directory (default: %LOCALAPPDATA%\opencode-desktop-selector-patch\logs)
 */
const fs = require("fs");
const path = require("path");
const { spawnSync } = require("child_process");
const { resolveAsar, inspect, apply } = require("./lib/asar-patch")

const LOG_DIR = process.env.OCSP_LOG_DIR || path.join(process.env.LOCALAPPDATA || ".", "opencode-desktop-selector-patch", "logs");
const LOG = path.join(LOG_DIR, "auto-patch.log");
const STATE = path.join(LOG_DIR, "auto-patch.state");
const LOG_MAX = 256 * 1024;

function log(line) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    if (fs.existsSync(LOG) && fs.statSync(LOG).size > LOG_MAX) fs.renameSync(LOG, LOG + ".old");
    fs.appendFileSync(LOG, new Date().toISOString() + " " + line + "\n");
  } catch {
    /* logging must never break the task */
  }
}

function readState() {
  try {
    return fs.readFileSync(STATE, "utf8").trim();
  } catch {
    return "";
  }
}

function writeState(s) {
  try {
    fs.mkdirSync(LOG_DIR, { recursive: true });
    fs.writeFileSync(STATE, s);
  } catch {
    /* best-effort */
  }
}

function main() {
  const asar = resolveAsar(undefined);
  if (!fs.existsSync(asar)) {
    if (readState() !== "no-asar") {
      log("app.asar not found (Desktop not installed at the expected path): " + asar);
      writeState("no-asar");
    }
    return;
  }

  // An update may also have left a backup from the previous version behind.
  const bak = asar + ".orig";
  let current = inspect(asar);
  if (current.status === "original" && fs.existsSync(bak)) {
    try {
      if (fs.statSync(bak).size !== current.size) {
        fs.unlinkSync(bak);
        log("update detected: stale backup from another version removed, it will be recreated");
      }
    } catch (e) {
      log("warning: could not review the backup: " + e.message);
    }
  }

  if (current.status === "unknown") {
    if (readState() !== "needs-manual") {
      log("NEEDS-MANUAL: the patch patterns no longer match this Desktop version. Nothing was modified. See README.");
      writeState("needs-manual");
    }
    process.exitCode = 3;
    return;
  }

  if (current.status === "applied") {
    if (readState() !== "patched") {
      log("verified: app.asar is patched (nothing to do)");
      writeState("patched");
    }
    return;
  }

  // status === "original" | "mixed": a fresh (or partially patched) bundle.
  const res = apply(asar);
  if (res.createdBackup) log("backup created: " + asar + ".orig");
  if (res.changed) {
    log("PATCHED (" + res.applied.length + " edits): " + res.applied.join("; ") + ". Restart OpenCode Desktop to see it.");
    writeState("patched");
  } else {
    log("verified: app.asar is patched (nothing to do)");
    writeState("patched");
  }
}

try {
  main();
} catch (e) {
  log("unexpected error: " + (e && e.message ? e.message : e));
  writeState("error");
  process.exitCode = 1;
}