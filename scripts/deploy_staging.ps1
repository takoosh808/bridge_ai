param(
  [switch]$UseStagingTemplate,
  [string]$AdminToken = "",
  [switch]$SkipBuild
)

$ErrorActionPreference = "Stop"

function Assert-StatusCode {
  param(
    [string]$Url,
    [int]$Expected,
    [hashtable]$Headers = $null
  )

  try {
    if ($null -ne $Headers) {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -Headers $Headers -ErrorAction Stop
    } else {
      $response = Invoke-WebRequest -UseBasicParsing -Uri $Url -ErrorAction Stop
    }

    if ($response.StatusCode -ne $Expected) {
      throw "Expected $Expected from $Url but got $($response.StatusCode)"
    }
  } catch {
    $status = $null
    if ($_.Exception.Response -and $_.Exception.Response.StatusCode) {
      $status = [int]$_.Exception.Response.StatusCode.value__
    }

    if ($null -ne $status -and $status -eq $Expected) {
      return
    }

    throw "Expected $Expected from $Url but request failed. $($_.Exception.Message)"
  }
}

$repoRoot = Split-Path -Parent $PSScriptRoot
Push-Location $repoRoot

try {
  if ($UseStagingTemplate.IsPresent) {
    $sourceEnv = Join-Path $repoRoot ".env.staging.example"
    $targetEnv = Join-Path $repoRoot ".env"

    if (-not (Test-Path $sourceEnv)) {
      throw "Missing $sourceEnv"
    }

    if (Test-Path $targetEnv) {
      $backup = Join-Path $repoRoot (".env.backup." + (Get-Date -Format "yyyyMMddHHmmss"))
      Copy-Item $targetEnv $backup -Force
      Write-Host "Backed up .env to $backup"
    }

    Copy-Item $sourceEnv $targetEnv -Force
    Write-Host "Applied staging template to .env"
  }

  $composeArgs = @("compose", "up", "-d")
  if (-not $SkipBuild.IsPresent) {
    $composeArgs += "--build"
  }

  Write-Host "Running: docker $($composeArgs -join ' ')"
  docker @composeArgs

  Write-Host "Waiting for health endpoint..."
  $healthReady = $false
  for ($i = 0; $i -lt 40; $i++) {
    try {
      $health = Invoke-WebRequest -UseBasicParsing http://localhost:8000/health -ErrorAction Stop
      if ($health.StatusCode -eq 200) {
        $healthReady = $true
        break
      }
    } catch {
    }

    Start-Sleep -Seconds 2
  }

  if (-not $healthReady) {
    throw "Health endpoint did not become ready in time"
  }

  Assert-StatusCode -Url "http://localhost:8000/health" -Expected 200
  Assert-StatusCode -Url "http://localhost:8000/admin/" -Expected 200
  Assert-StatusCode -Url "http://localhost:8000/admin/overview" -Expected 401

  if (-not [string]::IsNullOrWhiteSpace($AdminToken)) {
    $headers = @{ "x-admin-token" = $AdminToken }
    Assert-StatusCode -Url "http://localhost:8000/admin/overview" -Expected 200 -Headers $headers
    Assert-StatusCode -Url "http://localhost:8000/admin/auth/check" -Expected 200 -Headers $headers
    Assert-StatusCode -Url "http://localhost:8000/admin/observability" -Expected 200 -Headers $headers
    Assert-StatusCode -Url "http://localhost:8000/admin/audit-logs?limit=5" -Expected 200 -Headers $headers
    Assert-StatusCode -Url "http://localhost:8000/admin/audit-logs?limit=5&action=admin_auth" -Expected 200 -Headers $headers
    Write-Host "Authorized admin checks passed."
  } else {
    Write-Host "Admin token check skipped (pass -AdminToken to enable)."
  }

  Write-Host "Staging deploy checks passed."
} finally {
  Pop-Location
}
