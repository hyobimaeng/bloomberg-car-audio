param(
  [switch]$SkipPush,
  [switch]$SkipNotify
)

$ErrorActionPreference = "Stop"
$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot "..")).Path
$ghPath = "C:\Program Files\GitHub CLI\gh.exe"

function Import-DotEnv {
  param(
    [string]$Path
  )

  if (-not (Test-Path -LiteralPath $Path)) {
    return
  }

  Get-Content -LiteralPath $Path -Encoding utf8 | ForEach-Object {
    $line = $_.Trim()
    if (-not $line -or $line.StartsWith("#")) {
      return
    }

    $pair = $line -split "=", 2
    if ($pair.Count -ne 2) {
      return
    }

    $key = $pair[0].Trim()
    $value = $pair[1].Trim()

    if (($value.StartsWith('"') -and $value.EndsWith('"')) -or ($value.StartsWith("'") -and $value.EndsWith("'"))) {
      $value = $value.Substring(1, $value.Length - 2)
    }

    Set-Item -Path ("Env:{0}" -f $key) -Value $value
  }
}

Push-Location $repoRoot
try {
  Import-DotEnv -Path (Join-Path $repoRoot ".env")
  node src/main.mjs

  git add dist
  git diff --cached --quiet
  if ($LASTEXITCODE -eq 0) {
    Write-Output "No dist changes to commit."
  } else {
    $stamp = Get-Date -Format "yyyy-MM-dd"
    git commit -m "Update local digest $stamp"

    if (-not $SkipPush) {
      $token = & $ghPath auth token
      $basic = [Convert]::ToBase64String([Text.Encoding]::ASCII.GetBytes("x-access-token:$token"))
      git -c http.sslbackend=openssl -c "http.https://github.com/.extraheader=AUTHORIZATION: basic $basic" push origin main
    }
  }

  if (-not $SkipNotify -and $env:TELEGRAM_BOT_TOKEN -and $env:TELEGRAM_CHAT_ID) {
    node src/notify.mjs dist/archive.json
  }
}
finally {
  Pop-Location
}
