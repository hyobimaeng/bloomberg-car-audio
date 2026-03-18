param(
  [Parameter(Mandatory = $true)]
  [string]$TextPath,
  [Parameter(Mandatory = $true)]
  [string]$OutputPath,
  [string]$VoiceName = "Microsoft Huihui Desktop"
)

$ErrorActionPreference = "Stop"

$text = Get-Content -LiteralPath $TextPath -Raw -Encoding UTF8
if ([string]::IsNullOrWhiteSpace($text)) {
  throw "TextPath was empty."
}

$voice = New-Object -ComObject SAPI.SpVoice
$voices = $voice.GetVoices()
for ($i = 0; $i -lt $voices.Count; $i++) {
  $candidate = $voices.Item($i)
  if ($candidate.GetDescription() -eq $VoiceName) {
    $voice.Voice = $candidate
    break
  }
}

$stream = New-Object -ComObject SAPI.SpFileStream
$stream.Open($OutputPath, 3, $false)
$voice.AudioOutputStream = $stream
$null = $voice.Speak($text)
$stream.Close()
