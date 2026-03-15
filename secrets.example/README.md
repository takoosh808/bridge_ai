# Local secrets directory (`.secrets`)

Bridge supports reading secrets from files mounted at `/run/secrets`.

## Setup
1. Create local folder (gitignored):
   - `mkdir .secrets`
2. Create these files as needed:
   - `.secrets/webhook_secret`
   - `.secrets/github_token`
   - `.secrets/openai_api_key`
   - `.secrets/admin_api_token_hash`
   - `.secrets/admin_api_token_pepper`
3. Put raw secret values in each file (single line, no quotes).
4. Run:
   - `docker compose up -d --build`

## Admin token hash example (HMAC mode)
PowerShell:

```powershell
$token = "change-me-to-long-random"
$pepper = "change-me-to-server-only-secret"
$h = New-Object System.Security.Cryptography.HMACSHA256
$h.Key = [System.Text.Encoding]::UTF8.GetBytes($pepper)
$hash = [System.BitConverter]::ToString($h.ComputeHash([System.Text.Encoding]::UTF8.GetBytes($token))).Replace("-", "").ToLower()

Set-Content -NoNewline .secrets/admin_api_token_pepper $pepper
Set-Content -NoNewline .secrets/admin_api_token_hash $hash
```

Use `$token` in the dashboard token field or `x-admin-token` header.
