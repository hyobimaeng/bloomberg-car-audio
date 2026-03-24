param(
  [string]$TaskNamePrefix = "BloombergCarAudio",
  [string]$MorningTime = "07:20",
  [string]$MiddayTime = "12:40",
  [string]$EveningTime = "20:40",
  [switch]$RunNow
)

$ErrorActionPreference = "Stop"

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$powershellPath = "C:\Windows\System32\WindowsPowerShell\v1.0\powershell.exe"
$runnerScript = Join-Path $repoRoot "scripts\run-local-digest.ps1"
$currentUser = [System.Security.Principal.WindowsIdentity]::GetCurrent().Name

function Register-DigestTask {
  param(
    [string]$TaskName,
    [string]$Time,
    [string]$RunSet
  )

  $startBoundary = [DateTime]::ParseExact($Time, "HH:mm", [System.Globalization.CultureInfo]::InvariantCulture)
  $action = New-ScheduledTaskAction `
    -Execute $powershellPath `
    -Argument "-NoProfile -ExecutionPolicy Bypass -File `"$runnerScript`" -RunSet $RunSet" `
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
    -Description "Generate Bloomberg Chinese digest ($RunSet), publish dist to GitHub Pages, and optionally notify Telegram." `
    -Force | Out-Null

  Write-Output ("Registered scheduled task '{0}' at {1} for {2}." -f $TaskName, $Time, $currentUser)
}

$tasks = @(
  @{ Name = "$TaskNamePrefix-Morning"; Time = $MorningTime; RunSet = "morning" },
  @{ Name = "$TaskNamePrefix-Midday"; Time = $MiddayTime; RunSet = "midday" },
  @{ Name = "$TaskNamePrefix-Evening"; Time = $EveningTime; RunSet = "evening" }
)

foreach ($task in $tasks) {
  Register-DigestTask -TaskName $task.Name -Time $task.Time -RunSet $task.RunSet
}

Write-Output "Missed runs will start as soon as the PC becomes available."

if ($RunNow) {
  foreach ($task in $tasks) {
    Start-ScheduledTask -TaskName $task.Name
    Write-Output ("Started scheduled task '{0}'." -f $task.Name)
  }
}
