param(
  [string]$TaskName = "BloombergCarAudioDaily",
  [string]$Time = "07:20",
  [switch]$RunNow
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$powershellPath = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
$runnerScript = Join-Path $repoRoot "scripts\run-local-digest.ps1"
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

$startBoundary = [DateTime]::ParseExact($Time, "HH:mm", [System.Globalization.CultureInfo]::InvariantCulture)
$action = New-ScheduledTaskAction `
  -Execute $powershellPath `
  -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runnerScript`"" `
  -WorkingDirectory $repoRoot

$trigger = New-ScheduledTaskTrigger -Daily -At $startBoundary
$settings = New-ScheduledTaskSettingsSet `
  -AllowStartIfOnBatteries `
  -DontStopIfGoingOnBatteries `
  -StartWhenAvailable `
  -MultipleInstances IgnoreNew `
  -ExecutionTimeLimit (New-TimeSpan -Hours 2) `
  -RestartCount 3 `
  -RestartInterval (New-TimeSpan -Minutes 15)

$principal = New-ScheduledTaskPrincipal -UserId $currentUser -LogonType Interactive -RunLevel Limited

Register-ScheduledTask `
  -TaskName $TaskName `
  -Action $action `
  -Trigger $trigger `
  -Settings $settings `
  -Principal $principal `
  -Description "Generate Bloomberg Chinese car-audio digest, publish dist to GitHub Pages, and optionally notify Telegram." `
  -Force | Out-Null

Write-Output ("Registered scheduled task '{0}' at {1} for {2}." -f $TaskName, $Time, $currentUser)
Write-Output "Missed runs will start as soon as the PC becomes available."

if ($RunNow) {
  Start-ScheduledTask -TaskName $TaskName
  Write-Output ("Started scheduled task '{0}'." -f $TaskName)
}
