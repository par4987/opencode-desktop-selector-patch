# install-task.ps1 — optional: keep the patch applied automatically.
#
# A Desktop update overwrites app.asar, which drops the patch. This registers a
# per-user scheduled task that runs auto-patch.js on a short interval; it exits
# silently when there is nothing to do.
#
#   powershell -ExecutionPolicy Bypass -File .\install-task.ps1
#   powershell -ExecutionPolicy Bypass -File .\install-task.ps1 -EveryMinutes 10
#
# No administrator rights are needed (current-user task). If Windows asks for
# elevation, accept it or run the shell as administrator.
param(
  [int]$EveryMinutes = 5,
  [string]$TaskName = "OpenCode-Desktop-Selector-Patch"
)

$ErrorActionPreference = "Stop"
$root = Split-Path -Parent $MyInvocation.MyCommand.Path
$launcher = Join-Path $root "launch-hidden.vbs"
if (-not (Test-Path $launcher)) { throw "launch-hidden.vbs not found next to this script" }

$action = New-ScheduledTaskAction -Execute "wscript.exe" -Argument "`"$launcher`""
$trigger = New-ScheduledTaskTrigger -Once -At (Get-Date).AddMinutes(1) -RepetitionInterval (New-TimeSpan -Minutes $EveryMinutes)
$settings = New-ScheduledTaskSettingsSet -StartWhenAvailable -MultipleInstances IgnoreNew -ExecutionTimeLimit (New-TimeSpan -Minutes 5)

Register-ScheduledTask -TaskName $TaskName -Action $action -Trigger $trigger -Settings $settings `
  -Description "Re-applies the OpenCode Desktop model selector patch after updates (optional, per user)." -Force | Out-Null

Write-Host "Installed task: $TaskName (every $EveryMinutes min)"
Write-Host "Logs:            %LOCALAPPDATA%\opencode-desktop-selector-patch\logs\auto-patch.log"
Write-Host "Apply the patch once now with:  node patch-selector.js"