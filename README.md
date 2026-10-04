# opencode-desktop-selector-patch

Widens the **model selector** and the **"Manage models"** dialog in
[OpenCode Desktop](https://opencode.ai) on Windows, by patching the installed
`resources/app.asar` in place.

Six edits, all **byte-for-byte length-preserving**, so the archive stays valid
without re-packing. A backup is taken first, and the tool refuses to write
anything if the markup no longer matches the expected patterns.

> Not affiliated with, endorsed by, or supported by the OpenCode project.
> It patches your local install only; no OpenCode files are redistributed here.

---

## What it changes

| # | Area | Before | After |
|---|------|--------|-------|
| 1 | Model selector popover | fixed `284px` wide | `560px` wide |
| 2 | Model selector popover list | fixed `220px` tall | `60vh` tall (scrolls with the window) |
| 3 | "Manage models" dialog | `size: large` | `size: x-large` |
| 4 | Settings panels | `scrollbar-width: none` | `scrollbar-width: auto` |
| 5 | Settings panels | hides the WebKit scrollbar | rule neutralised (native scrollbar shows) |
| 6 | Model names in settings | truncated with `…` | wraps, full name visible |

## Why

The stock popover is wide enough for ~10 short model names and shows a short
fixed-height list; with long provider-prefixed ids (`provider/model-variant`)
the useful ones are pushed out of view. #6 compounds it: names get an ellipsis
before you can read which model you are picking.

## Requirements

- Windows (the install path detection and the optional scheduled task are
  Windows-specific; tested on Windows 11).
- Node.js 16+ only to *run* the scripts. OpenCode Desktop itself is unaffected.
- OpenCode Desktop installed (default location, or pass `--asar`).

## Quick start

```powershell
git clone https://github.com/par4987/opencode-desktop-selector-patch.git
cd opencode-desktop-selector-patch

node patch-selector.js check      # report status, writes nothing
node patch-selector.js            # apply (idempotent)
```

Then **restart OpenCode Desktop**. Electron caches the bundle when the app
starts, so a running instance keeps the old styles until it relaunches.

If the app lives somewhere unusual:

```powershell
node patch-selector.js --asar "D:\Apps\OpenCode\resources\app.asar"
# or
$env:OPENCODE_ASAR = "D:\Apps\OpenCode\resources\app.asar"
node patch-selector.js
```

## Verify

```powershell
node patch-selector.js check
```

```
Status: APPLIED  (C:\Users\...\resources\app.asar)
asar: 124481279 bytes
  APPLIED  model selector popover width 284px -> 560px  (original=0 patched=1)
  ...
```

| Exit code | Meaning |
|-----------|---------|
| `0` | applied |
| `2` | pending edits (patch not applied yet) |
| `3` | patterns match neither form → this release changed the markup |
| `1` | error |

## Optional: keep it applied across updates

An OpenCode Desktop update replaces `app.asar` with the pristine bundle, which
drops the patch. `auto-patch.js` re-applies it and is designed to be silent:

```powershell
powershell -ExecutionPolicy Bypass -File .\install-task.ps1          # every 5 min
powershell -ExecutionPolicy Bypass -File .\install-task.ps1 -EveryMinutes 10
```

- Runs in the **current user** scope, no administrator rights needed.
- Writes a log **only when the state changes**:
  `%LOCALAPPDATA%\opencode-desktop-selector-patch\logs\auto-patch.log`
- If the markup ever changes, it logs `NEEDS-MANUAL`, touches nothing and
  exits `3`.

You can also run it by hand at any time: `node auto-patch.js`.

## Uninstall

```powershell
powershell -ExecutionPolicy Bypass -File .\uninstall-task.ps1            # task only
powershell -ExecutionPolicy Bypass -File .\uninstall-task.ps1 -Restore   # + undo the patch
```

`node patch-selector.js restore` alone also reverts the patch (refuses if the
current `app.asar` is not the patched one, so it cannot clobber a newer
version). Delete the log folder to remove every trace.

## How it works (and why it is safe)

`app.asar` is an Electron archive that ships the compiled UI. Each edit finds a
unique byte string and overwrites it **in place** with a string of the exact
same length:

- archive size and internal offsets stay identical → still a valid asar, no
  re-packing, no integrity metadata to regenerate;
- every pattern must match **exactly once**; if any of the six does not, the
  script aborts *before* writing a single byte;
- the first write creates `app.asar.orig`, and after writing the file is
  re-read and each edit is re-verified;
- `restore` only writes when the backup size matches the current file.

Edit #3 shrinks `manage-models-dialog` to `manage-models-dial` because
`large` → `x-large` is five characters shorter. The dialog keeps its class hook,
just one character shorter.

## Compatibility

Verified on **2.0.20** and **2.0.22** (Windows 11). The patch is
release-specific by construction: if a future version changes the markup, the
tools detect it and refuse to modify anything rather than guess.

## Troubleshooting

- **"Could not find app.asar automatically"** → pass `--asar` or set
  `OPENCODE_ASAR`.
- **Exit code 3 / `NEEDS-MANUAL`** → the bundle changed. Update the patterns in
  `lib/asar-patch.js` (search the bundle for the CSS classes above; they are
  unique strings).
- **No change in the UI** → restart Desktop; check `node patch-selector.js check`.
- **SmartScreen / AV flags the task** → it only writes to your user profile and
  calls `node`, the same as running the scripts by hand.

## License

MIT (see `LICENSE`). OpenCode itself is MIT-licensed, Copyright (c) 2025
opencode — this repository only contains tooling that edits your own local
installation, and no OpenCode source or binary files are included.