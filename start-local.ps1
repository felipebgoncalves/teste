$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$cfg = @{}
Get-Content (Join-Path $root '.env') | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') { $cfg[$matches[1].Trim()] = $matches[2].Trim().Trim('"') }
}
$apiKey = if ($cfg.ContainsKey('x-api-key')) { $cfg['x-api-key'] } else { $cfg['x-api_key'] }
if (-not $cfg['client_id'] -or -not $cfg['client_secret'] -or -not $apiKey) {
  throw 'Configure client_id, client_secret e x-api-key no .env.'
}
$env:SIMET_TOKEN_URL = $cfg['keycloak_token']
$env:SIMET_BASE_URL = $cfg['simet_url']
$env:SIMET_CLIENT_ID = $cfg['client_id']
$env:SIMET_CLIENT_SECRET = $cfg['client_secret']
$env:SIMET_API_KEY = $apiKey

$python = (& python -c 'import sys; print(sys.executable)').Trim()
$node = (Get-Command node -ErrorAction Stop).Source
$npm = Join-Path (Split-Path $node) 'npm.cmd'
$frontend = Join-Path $root 'frontend'
if (Get-NetTCPConnection -LocalPort 4200 -State Listen -ErrorAction SilentlyContinue) {
  throw 'A porta 4200 já está em uso.'
}
Push-Location $frontend
try {
  if (-not (Test-Path 'node_modules\@angular\cli\bin\ng.js')) {
    & $npm ci
    if ($LASTEXITCODE -ne 0) { throw 'Falha ao instalar as dependências do Angular.' }
  }
  & $npm run build
  if ($LASTEXITCODE -ne 0) { throw 'Falha no build do Angular.' }
} finally {
  Pop-Location
}

$serverScript = Join-Path $frontend 'local.py'
$logDir = Join-Path $root '.local'
New-Item -ItemType Directory -Path $logDir -Force | Out-Null
$server = Start-Process -FilePath $python -ArgumentList ('"{0}"' -f $serverScript) -WorkingDirectory $root -WindowStyle Hidden -PassThru -RedirectStandardOutput (Join-Path $logDir 'server.out.log') -RedirectStandardError (Join-Path $logDir 'server.err.log')
for ($attempt = 0; $attempt -lt 10; $attempt++) {
  if (-not (Get-Process -Id $server.Id -ErrorAction SilentlyContinue)) { break }
  if (Get-NetTCPConnection -LocalPort 4200 -State Listen -ErrorAction SilentlyContinue) {
    try {
      $response = Invoke-WebRequest 'http://127.0.0.1:4200/' -TimeoutSec 2
      if ($response.StatusCode -eq 200) {
        "Servidor local PID: $($server.Id)"
        'Abra http://127.0.0.1:4200'
        return
      }
    } catch { }
  }
  Start-Sleep -Seconds 1
}
Stop-Process -Id $server.Id -Force -ErrorAction SilentlyContinue
throw "O servidor local não iniciou. Consulte $logDir."
