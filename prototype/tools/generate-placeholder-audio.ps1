param(
  [string]$OutputDirectory = (Join-Path $PSScriptRoot '..\public\audio\spatial-prototype')
)

$ErrorActionPreference = 'Stop'
Add-Type -AssemblyName System.Speech
$resolvedOutput = [System.IO.Path]::GetFullPath($OutputDirectory)
[System.IO.Directory]::CreateDirectory($resolvedOutput) | Out-Null

$clips = @(
  @{ File = 'friend-a.wav'; Voice = 'Microsoft Huihui Desktop'; Rate = 1; TextBase64 = '5Yia5omN6Lev6L+H6Z2i5YyF5bqX77yM6Ze76LW35p2l54m55Yir6aaZ44CC' },
  @{ File = 'friend-b.wav'; Voice = 'Microsoft Huihui Desktop'; Rate = 0; TextBase64 = '5oiR5Zyo5YWs5Zut55yL6KeB5LiA5Y+q6JOd6Imy55qE5bCP6bif44CC' },
  @{ File = 'friend-c.wav'; Voice = 'Microsoft Huihui Desktop'; Rate = -1; TextBase64 = '5ZGo5pyr6KaB5LiN6KaB5LiA6LW35Y6755yL55S15b2x77yf' }
)

foreach ($clip in $clips) {
  $target = Join-Path $resolvedOutput $clip.File
  $speaker = New-Object System.Speech.Synthesis.SpeechSynthesizer
  try {
    $speaker.SelectVoice($clip.Voice)
    $speaker.Rate = $clip.Rate
    $speaker.Volume = 82
    $speaker.SetOutputToWaveFile($target)
    $text = [Text.Encoding]::UTF8.GetString([Convert]::FromBase64String($clip.TextBase64))
    $speaker.Speak($text)
  }
  finally {
    $speaker.Dispose()
  }
}

Write-Output "Generated local placeholder clips in $resolvedOutput"
