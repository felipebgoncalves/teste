# Painel SIMET ES

Interface Angular e API Python para consultar as 29 estações da API SIMET ES. A API obtém o JWT por `client_credentials`, envia a `X-API-Key`, consulta as estações e percorre as páginas de observações de 15 minutos para calcular a chuva nas últimas 24 horas. Uma estação sem observações aparece como **Sem dados**, não como 0 mm.

## Execução local

Credenciais ficam no `.env` da raiz, que não deve ser versionado. Campos esperados: `keycloak_token`, `simet_url`, `client_id`, `client_secret`, `x-api-key`.

```powershell
.\start-local.ps1
```

Abra <http://127.0.0.1:4200>. O script compila o Angular e serve a página e `/api/chuva` no mesmo processo Python. Para ver alterações no Angular, execute o script novamente.

## Build e publicação na Vercel

O projeto Vercel deve usar **`frontend` como Root Directory**. O arquivo `frontend/vercel.json` já define `npm run build`, o diretório `dist/frontend/browser` e a função Python `/api/chuva`. O Angular e essa API rodam no mesmo projeto Vercel, sem servidor externo.

No painel da Vercel, importe o repositório GitHub, selecione `frontend` como Root Directory e configure estas variáveis de ambiente no projeto:

| Nome | Valor |
|---|---|
| `SIMET_CLIENT_ID` | `client_id` recebido da CEPDEC |
| `SIMET_CLIENT_SECRET` | `client_secret` recebido da CEPDEC |
| `SIMET_API_KEY` | `x-api-key` recebida da CEPDEC |
| `SIMET_TOKEN_URL` | Opcional; URL do Keycloak usada no `.env` local |
| `SIMET_BASE_URL` | Opcional; URL base HTTPS da API SIMET usada no `.env` local |

As três primeiras são obrigatórias. A função também aceita os nomes já usados no projeto Vercel `simet_es`: `client_id`, `client_secret`, `X_API_Key`, `keycloak_token` e `simet_url`. Os valores não devem ser adicionados ao repositório nem ao código Angular. Após configurar as variáveis, execute **Deploy** ou **Redeploy** na Vercel. Confira a página e a resposta de `/api/chuva` no domínio publicado.

Para validar o build antes de publicar:

```powershell
cd frontend
npm ci
npm run build
```
