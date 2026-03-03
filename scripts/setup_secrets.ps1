param(
  [string]$WebhookSecret = "dev_webhook_secret",
  [string]$GithubToken = "",
  [string]$OpenAiApiKey = "",
  [string]$AdminToken = "",
  [string]$AdminPepper = "",
  [switch]$Force
)

$ErrorActionPreference = "Stop"

function New-RandomHex {
  param([int]$Length = 64)

  $byteCount = [Math]::Ceiling($Length / 2)
  $bytes = New-Object byte[] $byteCount
  $rng = [System.Security.Cryptography.RandomNumberGenerator]::Create()
  $rng.GetBytes($bytes)
  $rng.Dispose()
  return ([System.BitConverter]::ToString($bytes).Replace('-', '').ToLower()).Substring(0, $Length)
}

function Write-SecretFile {
  param(
    [string]$Path,
    [string]$Value
  )

  if ((Test-Path $Path) -and -not $Force.IsPresent) {
    Write-Host "Skip existing: $Path (use -Force to overwrite)"
    return
  }

  Set-Content -NoNewline -Encoding UTF8 $Path $Value
  Write-Host "Wrote: $Path"
}

$repoRoot = Split-Path -Parent $PSScriptRoot
$secretsDir = Join-Path $repoRoot ".secrets"

if (-not (Test-Path $secretsDir)) {
  New-Item -ItemType Directory -Path $secretsDir | Out-Null
}

if ([string]::IsNullOrWhiteSpace($AdminToken)) {
  $AdminToken = "admin-" + (New-RandomHex -Length 40)
}

if ([string]::IsNullOrWhiteSpace($AdminPepper)) {
  $AdminPepper = New-RandomHex -Length 64
}

$hmac = New-Object System.Security.Cryptography.HMACSHA256
$hmac.Key = [System.Text.Encoding]::UTF8.GetBytes($AdminPepper)
$adminHash = [System.BitConverter]::ToString(
  $hmac.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($AdminToken))
).Replace('-', '').ToLower()

Write-SecretFile -Path (Join-Path $secretsDir "webhook_secret") -Value $WebhookSecret
Write-SecretFile -Path (Join-Path $secretsDir "github_token") -Value $GithubToken
Write-SecretFile -Path (Join-Path $secretsDir "openai_api_key") -Value $OpenAiApiKey
Write-SecretFile -Path (Join-Path $secretsDir "admin_api_token_pepper") -Value $AdminPepper
Write-SecretFile -Path (Join-Path $secretsDir "admin_api_token_hash") -Value $adminHash

Write-Host ""
Write-Host "Secrets bootstrap complete."
Write-Host "Admin token (save this now): $AdminToken"
Write-Host "Run: docker compose up -d --build"
