' launch-hidden.vbs — runs auto-patch.js with no visible console window.
' Used as the action of the optional scheduled task created by install-task.ps1.

Option Explicit
Dim shell, fso, base, nodeExe, script

Set shell = CreateObject("WScript.Shell")
Set fso = CreateObject("Scripting.FileSystemObject")

base = fso.GetParentFolderName(WScript.ScriptFullName) & "\"
script = base & "auto-patch.js"

nodeExe = shell.ExpandEnvironmentStrings("%ProgramFiles%\nodejs\node.exe")
If Not fso.FileExists(nodeExe) Then
  nodeExe = "node.exe" ' rely on PATH
End If

' 0 = hidden window, False = don't wait
shell.Run """" & nodeExe & """ """ & script & """", 0, False