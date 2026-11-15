$ErrorActionPreference = 'Stop'
$root = $PSScriptRoot
$cfg = @{}
Get-Content (Join-Path $root '.env') | ForEach-Object {
  if ($_ -match '^\s*([^#=]+)=(.*)$') { $cfg[$matches[1].Trim()] = $matches[2].Trim().Trim('"') }
}
$env:SIMET_TOKEN_URL = $cfg['keycloak_token']
$env:SIMET_BASE_URL = $cfg['simet_url']
$env:SIMET_CLIENT_ID = $cfg['client_id']
$env:SIMET_CLIENT_SECRET = $cfg['client_secret']
$env:SIMET_API_KEY = $cfg['x-api_key']
$java = 'C:\Program Files\Eclipse Adoptium\jdk-21.0.13.9-hotspot\bin\java.exe'
$node = 'C:\Program Files\nodejs'
$env:PATH = "$node;$env:PATH"
$backend = Start-Process -FilePath $java -ArgumentList '-jar', (Join-Path $root 'backend\target\simet-frontend-api-1.0.0.jar') -WorkingDirectory $root -WindowStyle Hidden -PassThru
$frontend = Start-Process -FilePath (Join-Path $node 'node.exe') -ArgumentList (Join-Path $root 'frontend\node_modules\@angular\cli\bin\ng.js'),'serve','--host','127.0.0.1','--proxy-config','proxy.conf.json' -WorkingDirectory (Join-Path $root 'frontend') -WindowStyle Hidden -PassThru
"Backend PID: $($backend.Id)"
"Frontend PID: $($frontend.Id)"
"Abra http://localhost:4200"
