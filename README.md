# Painel SIMET ES

Interface Angular e serviço Spring Boot para consultar as 29 estações da API SIMET ES. O backend obtém o JWT por `client_credentials`, envia a `X-API-Key`, consulta as estações e percorre as páginas de observações de 15 minutos para calcular a chuva nas últimas 24 horas. Uma estação sem observações aparece como **Sem dados**, não como 0 mm.

## Execução local

Credenciais ficam no `.env` da raiz, que não deve ser versionado. Campos esperados: `keycloak_token`, `simet_url`, `client_id`, `client_secret`, `x-api_key`.

```powershell
& .\.tools\apache-maven-3.9.11\bin\mvn.cmd -f backend\pom.xml package -DskipTests
cd frontend
npm install
cd ..
.\start-local.ps1
```

Abra <http://localhost:4200>. O frontend encaminha `/api` ao Spring Boot em `localhost:8080`.
# teste
# teste
# teste
