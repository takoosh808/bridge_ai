param(
    [switch]$Verbose,
    [switch]$SkipDocker,
    [switch]$CheckHealth
)

# Configuration
$DOCKER_MIN_VERSION = "23.0"
$NODE_MIN_VERSION = "20.0"
$REQUIRED_PORTS = @(8000, 5432, 6379)
$REQUIRED_ENV_VARS = @("ADMIN_TOKEN", "GITHUB_WEBHOOK_SECRET")
$OPTIONAL_ENV_VARS = @("GITHUB_TOKEN")
$API_ENDPOINT = "http://localhost:8000"
$HEALTH_CHECK_TIMEOUT = 30

# Counters
$PassCount = 0
$WarnCount = 0
$FailCount = 0
$SkipCount = 0

function Write-CheckStatus {
    param([string]$Check, [string]$Status, [string]$Message = "")
    
    $colors = @{ PASS = "Green"; FAIL = "Red"; WARN = "Yellow"; SKIP = "Cyan"; INFO = "White" }
    $symbol = @{ PASS = "[+]"; FAIL = "[X]"; WARN = "[!]"; SKIP = "[>]"; INFO = "[*]" }[$Status]
    
    $output = "$symbol $Check"
    if ($Message) { $output += " -- $Message" }
    
    Write-Host $output -ForegroundColor $colors[$Status]
    
    switch ($Status) {
        "PASS"  { $script:PassCount++ }
        "FAIL"  { $script:FailCount++ }
        "WARN"  { $script:WarnCount++ }
        "SKIP"  { $script:SkipCount++ }
    }
}

function Test-Command {
    param([string]$Command)
    try { $null = Get-Command $Command -ErrorAction Stop; return $true }
    catch { return $false }
}

function Get-CommandVersion {
    param([string]$Command, [string]$Flag = "--version")
    try { 
        $output = & $Command $Flag 2>&1
        return ($output -split '\n')[0]
    }
    catch { return $null }
}

function Compare-Versions {
    param([string]$Current, [string]$Required)
    
    $cMatch = $Current -match '(\d+)\.(\d+)'
    $rMatch = $Required -match '(\d+)\.(\d+)'
    
    if (-not $cMatch -or -not $rMatch) { return $null }
    
    $cVer = [version]"$($matches[1]).$($matches[2])"
    $rVer = [version]($Required -replace '[a-zA-Z].*', '')
    
    return $cVer -ge $rVer
}

function Test-PortAvailable {
    param([int]$Port)
    try {
        $conn = Test-NetConnection -ComputerName localhost -Port $Port -WarningAction SilentlyContinue
        return -not $conn.TcpTestSucceeded
    }
    catch { return $true }
}

Write-Host ""
Write-Host "Bridge AI Preflight Validation" -ForegroundColor Cyan
Write-Host "==============================" -ForegroundColor Cyan
Write-Host ""

# 1. Docker Checks
Write-Host "1. Docker Configuration" -ForegroundColor White
Write-Host "-----------------------" -ForegroundColor White

if ($SkipDocker) {
    Write-CheckStatus "Docker installation" "SKIP" "Skipped by user"
}
else {
    if (Test-Command "docker") {
        Write-CheckStatus "Docker installation" "PASS"
        
        $dVer = Get-CommandVersion "docker"
        if (Compare-Versions $dVer $DOCKER_MIN_VERSION) {
            Write-CheckStatus "Docker version" "PASS" $dVer
        }
        else {
            Write-CheckStatus "Docker version" "FAIL" "Expected $DOCKER_MIN_VERSION+, got $dVer"
        }
    }
    else {
        Write-CheckStatus "Docker installation" "FAIL" "Docker not found"
    }
    
    if (Test-Command "docker-compose") {
        Write-CheckStatus "Docker Compose" "PASS" (Get-CommandVersion "docker-compose")
    }
    elseif (Test-Command "docker") {
        $cVer = & docker compose version 2>&1
        if ($cVer -match "version") {
            Write-CheckStatus "Docker Compose" "PASS" "Integrated in Docker"
        }
        else {
            Write-CheckStatus "Docker Compose" "FAIL" "Not found"
        }
    }
}

Write-Host ""

# 2. Node.js Checks
Write-Host "2. Node.js Configuration" -ForegroundColor White
Write-Host "------------------------" -ForegroundColor White

if (Test-Command "node") {
    $nVer = Get-CommandVersion "node"
    if (Compare-Versions $nVer $NODE_MIN_VERSION) {
        Write-CheckStatus "Node.js version" "PASS" $nVer
    }
    else {
        Write-CheckStatus "Node.js version" "WARN" "Expected $NODE_MIN_VERSION+, got $nVer"
    }
}
else {
    Write-CheckStatus "Node.js installation" "WARN" "Not found. Install from https://nodejs.org/"
}

Write-Host ""

# 3. Environment Configuration
Write-Host "3. Environment Configuration" -ForegroundColor White
Write-Host "----------------------------" -ForegroundColor White

$envFile = ".env"

if (Test-Path $envFile) {
    Write-CheckStatus ".env file" "PASS"
    $envContent = Get-Content $envFile
    
    foreach ($var in $REQUIRED_ENV_VARS) {
        if ($envContent -match "^$var=") {
            $val = ($envContent | Select-String "^$var=" | ForEach-Object { $_ -split '=' | Select-Object -Last 1 }).Trim()
            if ($val -and $val.Length -gt 3) {
                Write-CheckStatus "  $var" "PASS"
            }
            else {
                Write-CheckStatus "  $var" "FAIL" "Empty or too short"
            }
        }
        else {
            Write-CheckStatus "  $var" "FAIL" "Not found"
        }
    }
}
else {
    Write-CheckStatus ".env file" "FAIL" "Not found. Copy .env.example and edit."
}

Write-Host ""

# 4. Port Availability
Write-Host "4. Port Availability" -ForegroundColor White
Write-Host "-------------------" -ForegroundColor White

$portNames = @{ 8000 = "API"; 5432 = "PostgreSQL"; 6379 = "Redis" }
$conflicts = @()

foreach ($port in $REQUIRED_PORTS) {
    $name = $portNames[$port]
    if (Test-PortAvailable $port) {
        Write-CheckStatus "Port $port ($name)" "PASS"
    }
    else {
        Write-CheckStatus "Port $port ($name)" "FAIL" "In use"
        $conflicts += $port
    }
}

if ($conflicts) {
    Write-Host "  Ports $conflicts are in use. Stop other services." -ForegroundColor Red
}

Write-Host ""

# 5. Docker Compose File
Write-Host "5. Docker Compose Configuration" -ForegroundColor White
Write-Host "------------------------------" -ForegroundColor White

if (Test-Path "docker-compose.yml") {
    Write-CheckStatus "docker-compose.yml" "PASS"
    $compContent = Get-Content "docker-compose.yml" -Raw
    
    foreach ($svc in @("api", "postgres", "redis")) {
        if ($compContent -match "^\s*$svc\s*:" -or $compContent -match "`n\s+$svc\s*:") {
            Write-CheckStatus "  $svc service" "PASS"
        }
        else {
            Write-CheckStatus "  $svc service" "WARN" "May not be defined"
        }
    }
}
else {
    Write-CheckStatus "docker-compose.yml" "FAIL" "Not found"
}

Write-Host ""

# 6. Health Check
if ($CheckHealth) {
    Write-Host "6. Health Check" -ForegroundColor White
    Write-Host "---------------" -ForegroundColor White
    
    $passed = $false
    for ($i = 0; $i -lt $HEALTH_CHECK_TIMEOUT; $i++) {
        try {
            $resp = Invoke-WebRequest -Uri "$API_ENDPOINT/health" -UseBasicParsing -WarningAction SilentlyContinue -TimeoutSec 2 -ErrorAction Stop
            if ($resp.StatusCode -eq 200) {
                Write-CheckStatus "API health" "PASS" "Responding"
                $passed = $true
                break
            }
        }
        catch {
            if ($i % 5 -eq 0) { Write-Verbose "Waiting for API..." }
            Start-Sleep -Seconds 1
        }
    }
    
    if (-not $passed) {
        Write-CheckStatus "API health" "FAIL" "Not responding after $HEALTH_CHECK_TIMEOUT sec"
    }
    Write-Host ""
}

# 7. Summary
Write-Host "Summary" -ForegroundColor White
Write-Host "=======" -ForegroundColor White
Write-Host ""
Write-Host "Passed:  $PassCount" -ForegroundColor Green
Write-Host "Warned:  $WarnCount" -ForegroundColor Yellow
Write-Host "Failed:  $FailCount" -ForegroundColor Red
Write-Host ""

if ($FailCount -gt 0) {
    Write-Host "Preflight FAILED. Fix issues above." -ForegroundColor Red
    exit 1
}
elseif ($WarnCount -gt 0) {
    Write-Host "Preflight PASSED with warnings." -ForegroundColor Yellow
    exit 0
}
else {
    Write-Host "Preflight PASSED. Ready for deployment." -ForegroundColor Green
    exit 0
}
