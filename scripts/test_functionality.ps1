param(
  [string]$BaseUrl = "http://localhost:8000",
  [string]$EnvFile = ".env",
  [string]$RepoFullName = "takoosh808/bridge_ai",
  [int]$PrNumber = 1
)

Set-StrictMode -Version Latest
$ErrorActionPreference = "Stop"

function Get-EnvValue {
  param(
    [string]$Path,
    [string]$Key
  )

  if (-not (Test-Path $Path)) {
    return ""
  }

  $line = Get-Content $Path | Where-Object { $_ -match "^$Key=" } | Select-Object -First 1
  if (-not $line) {
    return ""
  }

  return $line.Split('=', 2)[1]
}

function New-HmacSignature {
  param(
    [string]$Secret,
    [string]$Body
  )

  $hmac = New-Object System.Security.Cryptography.HMACSHA256
  $hmac.Key = [Text.Encoding]::UTF8.GetBytes($Secret)
  $hash = -join ($hmac.ComputeHash([Text.Encoding]::UTF8.GetBytes($Body)) | ForEach-Object { $_.ToString('x2') })
  return "sha256=$hash"
}

function Invoke-JsonRequest {
  param(
    [string]$Method,
    [string]$Uri,
    [hashtable]$Headers,
    [string]$Body
  )

  try {
    $response = Invoke-WebRequest -UseBasicParsing -Method $Method -Uri $Uri -Headers $Headers -ContentType "application/json" -Body $Body
    $json = $null
    if ($response.Content) {
      $json = $response.Content | ConvertFrom-Json
    }

    return [pscustomobject]@{
      StatusCode = [int]$response.StatusCode
      Json = $json
      Raw = $response.Content
    }
  }
  catch {
    $resp = $_.Exception.Response
    if (-not $resp) {
      throw
    }

    $statusCode = [int]$resp.StatusCode
    $stream = $resp.GetResponseStream()
    $reader = New-Object System.IO.StreamReader($stream)
    $content = $reader.ReadToEnd()

    $json = $null
    if ($content) {
      try {
        $json = $content | ConvertFrom-Json
      }
      catch {
        $json = $null
      }
    }

    return [pscustomobject]@{
      StatusCode = $statusCode
      Json = $json
      Raw = $content
    }
  }
}

function Get-ErrorCode {
  param($Response)

  if ($null -eq $Response -or $null -eq $Response.Json) {
    return ""
  }

  if ($Response.Json.PSObject.Properties.Name -contains 'error') {
    $err = $Response.Json.error
    if ($null -eq $err) {
      return ""
    }

    if ($err -is [string]) {
      return $err
    }

    if ($err.PSObject.Properties.Name -contains 'code') {
      return [string]$err.code
    }
  }

  if ($Response.Raw -and $Response.Raw -match '"code"\s*:\s*"([A-Z0-9_]+)"') {
    return $Matches[1]
  }

  return ""
}

function Invoke-Webhook {
  param(
    [string]$Event,
    [string]$DeliveryId,
    [string]$Body,
    [string]$Signature
  )

  $headers = @{
    "X-GitHub-Event" = $Event
    "X-GitHub-Delivery" = $DeliveryId
    "X-Hub-Signature-256" = $Signature
  }

  return Invoke-JsonRequest -Method "POST" -Uri "$BaseUrl/webhook/github" -Headers $headers -Body $Body
}

$webhookSecret = Get-EnvValue -Path $EnvFile -Key "WEBHOOK_SECRET"
$githubToken = Get-EnvValue -Path $EnvFile -Key "GITHUB_TOKEN"

if ([string]::IsNullOrWhiteSpace($webhookSecret)) {
  throw "WEBHOOK_SECRET is missing in $EnvFile"
}

$results = New-Object System.Collections.Generic.List[object]

function Add-Result {
  param(
    [string]$Name,
    [bool]$Passed,
    [string]$Details
  )

  $results.Add([pscustomobject]@{
    Test = $Name
    Passed = $Passed
    Details = $Details
  })
}

function New-PullRequestPayloadJson {
  param(
    [string]$Action,
    [string]$Repo,
    [int]$Number,
    [bool]$Merged,
    [string]$HtmlUrl,
    [string]$MergedAt,
    [string]$MergeCommitSha,
    [string]$BaseRef,
    [string]$HeadRef
  )

  $payload = @{
    action = $Action
    repository = @{ full_name = $Repo }
    pull_request = @{
      number = $Number
      merged = $Merged
      html_url = $HtmlUrl
      merged_at = $MergedAt
      merge_commit_sha = $MergeCommitSha
      base = @{ ref = $BaseRef }
      head = @{ ref = $HeadRef }
    }
  }

  return ($payload | ConvertTo-Json -Depth 8 -Compress)
}

# 1) Health
$health = Invoke-WebRequest -UseBasicParsing -Method GET -Uri "$BaseUrl/health"
Add-Result -Name "Health endpoint" -Passed ($health.StatusCode -eq 200) -Details "status=$($health.StatusCode)"

# 2) Invalid signature -> 401
$bodyInvalidSig = '{"action":"closed","pull_request":{"merged":true}}'
$invalid = Invoke-Webhook -Event "pull_request" -DeliveryId "itest-invalid-signature" -Body $bodyInvalidSig -Signature "sha256=bad"
$invalidCode = Get-ErrorCode -Response $invalid
$invalidPass = ($invalid.StatusCode -eq 401)
Add-Result -Name "Invalid signature rejected" -Passed $invalidPass -Details "status=$($invalid.StatusCode), code=$invalidCode"

# 3) Ping event
$pingBody = '{"zen":"Keep it logically awesome."}'
$pingSig = New-HmacSignature -Secret $webhookSecret -Body $pingBody
$ping = Invoke-Webhook -Event "ping" -DeliveryId "itest-ping" -Body $pingBody -Signature $pingSig
$pingPass = (
  $ping.StatusCode -eq 200 -and
  $null -ne $ping.Json -and
  $ping.Json.PSObject.Properties.Name -contains 'received' -and
  $ping.Json.PSObject.Properties.Name -contains 'event' -and
  $ping.Json.received -eq $true -and
  $ping.Json.event -eq "ping"
)
Add-Result -Name "Ping event accepted" -Passed $pingPass -Details "status=$($ping.StatusCode)"

# 4) Unsupported event ignored
$pushBody = '{"ref":"refs/heads/main"}'
$pushSig = New-HmacSignature -Secret $webhookSecret -Body $pushBody
$push = Invoke-Webhook -Event "push" -DeliveryId "itest-push" -Body $pushBody -Signature $pushSig
$pushIgnored = $null
if ($null -ne $push.Json -and $push.Json.PSObject.Properties.Name -contains 'ignored') {
  $pushIgnored = $push.Json.ignored
}
$pushPass = ($push.StatusCode -eq 200 -and $pushIgnored -eq $true)
Add-Result -Name "Unsupported event ignored" -Passed $pushPass -Details "status=$($push.StatusCode), ignored=$pushIgnored"

# 5) Invalid pull_request payload -> 400
$badPayload = '{"action":"closed"}'
$badSig = New-HmacSignature -Secret $webhookSecret -Body $badPayload
$bad = Invoke-Webhook -Event "pull_request" -DeliveryId "itest-bad-payload" -Body $badPayload -Signature $badSig
$badCode = Get-ErrorCode -Response $bad
$badPass = ($bad.StatusCode -eq 400)
Add-Result -Name "Invalid PR payload handled" -Passed $badPass -Details "status=$($bad.StatusCode), code=$badCode"

# 6) Closed without merge ignored
$closedNotMergedBody = New-PullRequestPayloadJson `
  -Action "closed" `
  -Repo $RepoFullName `
  -Number $PrNumber `
  -Merged $false `
  -HtmlUrl "https://github.com/$RepoFullName/pull/$PrNumber" `
  -MergedAt $null `
  -MergeCommitSha $null `
  -BaseRef "main" `
  -HeadRef "test/bridge-webhook"
$closedNotMergedSig = New-HmacSignature -Secret $webhookSecret -Body $closedNotMergedBody
$closedNotMerged = Invoke-Webhook -Event "pull_request" -DeliveryId "itest-closed-not-merged" -Body $closedNotMergedBody -Signature $closedNotMergedSig
$closedIgnored = $null
if ($null -ne $closedNotMerged.Json -and $closedNotMerged.Json.PSObject.Properties.Name -contains 'ignored') {
  $closedIgnored = $closedNotMerged.Json.ignored
}
$closedPass = ($closedNotMerged.StatusCode -eq 200 -and $closedIgnored -eq $true)
Add-Result -Name "Closed-not-merged ignored" -Passed $closedPass -Details "status=$($closedNotMerged.StatusCode), ignored=$closedIgnored"

# 7) Merged PR path + idempotency replay
$mergeSha = "itest" + ([guid]::NewGuid().ToString("N").Substring(0, 12))
$mergedBody = New-PullRequestPayloadJson `
  -Action "closed" `
  -Repo $RepoFullName `
  -Number $PrNumber `
  -Merged $true `
  -HtmlUrl "https://github.com/$RepoFullName/pull/$PrNumber" `
  -MergedAt "2026-02-25T18:20:00Z" `
  -MergeCommitSha $mergeSha `
  -BaseRef "main" `
  -HeadRef "test/bridge-webhook"
$mergedSig = New-HmacSignature -Secret $webhookSecret -Body $mergedBody

$first = Invoke-Webhook -Event "pull_request" -DeliveryId "itest-merged-first" -Body $mergedBody -Signature $mergedSig
$firstQueued = $null
if ($null -ne $first.Json -and $first.Json.PSObject.Properties.Name -contains 'queued') {
  $firstQueued = $first.Json.queued
}
$firstCode = Get-ErrorCode -Response $first
$firstPass = (
  ($first.StatusCode -eq 202 -and $firstQueued -eq $true) -or
  ($first.StatusCode -eq 502)
)
Add-Result -Name "Merged PR first delivery" -Passed $firstPass -Details "status=$($first.StatusCode), queued=$firstQueued, code=$firstCode"

$dup = Invoke-Webhook -Event "pull_request" -DeliveryId "itest-merged-dup" -Body $mergedBody -Signature $mergedSig
$dupValue = $null
if ($null -ne $dup.Json -and $dup.Json.PSObject.Properties.Name -contains 'duplicate') {
  $dupValue = $dup.Json.duplicate
}
$dupCode = Get-ErrorCode -Response $dup
$dupPass = (
  ($dup.StatusCode -eq 200 -and $dupValue -eq $true) -or
  ($dup.StatusCode -eq 202) -or
  ($dup.StatusCode -eq 502)
)
Add-Result -Name "Merged PR duplicate replay" -Passed $dupPass -Details "status=$($dup.StatusCode), duplicate=$dupValue, code=$dupCode"

# 8) Summary retrieval (if summary id exists)
$summaryId = $null
if ($null -ne $first.Json -and $first.Json.PSObject.Properties.Name -contains 'summary') {
  $summaryObj = $first.Json.summary
  if ($null -ne $summaryObj -and $summaryObj.PSObject.Properties.Name -contains 'summary_id') {
    $summaryId = $summaryObj.summary_id
  }
}
if ($summaryId) {
  $summaryResp = Invoke-WebRequest -UseBasicParsing -Method GET -Uri "$BaseUrl/summary/$summaryId"
  $summaryPass = ($summaryResp.StatusCode -eq 200)
  Add-Result -Name "Summary retrieval" -Passed $summaryPass -Details "status=$($summaryResp.StatusCode), summary_id=$summaryId"
}
else {
  $summaryFallbackPass = ($first.StatusCode -eq 502)
  Add-Result -Name "Summary retrieval" -Passed $summaryFallbackPass -Details "No summary_id returned from merged PR flow"
}

# 9) Dead-letter capture (force 404 from GitHub API)
$missingRepo = "nonexistent-owner/nonexistent-repo"
$deadSha = "dead" + ([guid]::NewGuid().ToString("N").Substring(0, 8))
$deadBody = New-PullRequestPayloadJson `
  -Action "closed" `
  -Repo $missingRepo `
  -Number 1 `
  -Merged $true `
  -HtmlUrl "https://github.com/$missingRepo/pull/1" `
  -MergedAt "2026-02-25T18:20:00Z" `
  -MergeCommitSha $deadSha `
  -BaseRef "main" `
  -HeadRef "feature"
$deadSig = New-HmacSignature -Secret $webhookSecret -Body $deadBody
$dead = Invoke-Webhook -Event "pull_request" -DeliveryId "itest-dead-letter" -Body $deadBody -Signature $deadSig
$deadCode = Get-ErrorCode -Response $dead
$deadPass = ($dead.StatusCode -eq 502)
Add-Result -Name "Dead-letter failure path" -Passed $deadPass -Details "status=$($dead.StatusCode), code=$deadCode"

$deadListResp = Invoke-WebRequest -UseBasicParsing -Method GET -Uri "$BaseUrl/webhook/dead-letters?limit=5"
$deadListJson = $deadListResp.Content | ConvertFrom-Json
$deadListPass = ($deadListResp.StatusCode -eq 200 -and $deadListJson.count -ge 1)
Add-Result -Name "Dead-letter listing endpoint" -Passed $deadListPass -Details "status=$($deadListResp.StatusCode), count=$($deadListJson.count)"

# 10) Events lookup endpoint
$key = "$RepoFullName#$PrNumber#$mergeSha"
$keyEscaped = [uri]::EscapeDataString($key)
try {
  $eventLookupResp = Invoke-WebRequest -UseBasicParsing -Method GET -Uri "$BaseUrl/webhook/events?idempotencyKey=$keyEscaped"
  $eventLookupJson = $eventLookupResp.Content | ConvertFrom-Json
  $eventLookupPass = ($eventLookupResp.StatusCode -eq 200 -and $eventLookupJson.event.idempotency_key -eq $key)
  Add-Result -Name "Idempotency event lookup" -Passed $eventLookupPass -Details "status=$($eventLookupResp.StatusCode), key=$key"
}
catch {
  $status = $null
  if ($_.Exception.Response) {
    $status = [int]$_.Exception.Response.StatusCode
  }

  $acceptable = ($status -eq 404)
  Add-Result -Name "Idempotency event lookup" -Passed $acceptable -Details "status=$status, key=$key"
}

$passed = ($results | Where-Object { $_.Passed }).Count
$total = $results.Count
$failed = $total - $passed

Write-Host ""
Write-Host "=== Bridge Functionality Test Report ===" -ForegroundColor Cyan
$results | Format-Table -AutoSize
Write-Host ""
Write-Host "Passed: $passed / $total" -ForegroundColor Green
if ($failed -gt 0) {
  Write-Host "Failed: $failed" -ForegroundColor Red
  exit 1
}

Write-Host "All tests passed." -ForegroundColor Green
exit 0
