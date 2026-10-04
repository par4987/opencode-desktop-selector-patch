# uninstall-task.ps1 — remove the scheduled task and (optionally) undo the patch.
#
#   powershell -ExecutionPolicy Bypass -File .\uninstall-task.ps1
#   powershell -ExecutionPolicy Bypass -File .\uninstall-task.ps1 -Restore
param(
  [string]$TaskName = "OpenCode-Desktop-Selector-Patch",
  [switch]$Restore
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path

if (Get-ScheduledTask -TaskName $TaskName -ErrorAction SilentlyContinue) {
  Unregister-ScheduledTask -TaskName $TaskName -Confirm:$false
  Write-Host "Removed task: $TaskName"
} else {
  Write-Host "Task not found: $TaskName (nothing to remove)"
}

if ($Restore) {
  Write-Host "Restoring the unpatched app.asar ..."
  & node (Join-Path $root "patch-selector.js") restore
  Write-Host "Restart OpenCode Desktop to see the stock UI."
}

$bak = Join-Path $env:LOCALAPPDATA "opencode-desktop-selector-patch\logs"
Write-Host "Log folder kept at: $bak (delete it if you want to remove every trace)"