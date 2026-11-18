# Registro de decisões: reorganização do SIMET ES

## Critério

Peças que mudam pela mesma regra devem ficar juntas. Peças que mudam por motivos diferentes não devem depender uma da outra. O comportamento do painel deve permanecer igual.

## Decisões e problemas atendidos

- Usar `frontend/api/chuva.py` como implementação única da autenticação, paginação e cálculo da chuva, tanto na Vercel quanto localmente. Um adaptador local só inicia o mesmo handler HTTP.
  - `backend/src/main/java/br/gov/es/cepdec/simet/SimetController.java` e `frontend/api/chuva.py` repetiam a mesma janela de 24h, variável, frequência, deduplicação e formato de resposta. Uma mudança exigia editar ambos. Já diferiam no retry de 401 e no arredondamento.
  - O backend Java e suas dependências só eram usados pela execução local; a implantação atual usa Python.
- Servir o build Angular e `/api/chuva` no mesmo processo Python durante a execução local.
  - `start-local.ps1` era o único lugar que passava `--proxy-config`; `npm start` sozinho não conseguia consultar `/api/chuva`.
  - A tentativa de manter o servidor Angular em segundo plano não abriu a porta 4200 de forma confiável. O proxy e o script `start` deixaram de ser necessários.
- Iniciar Python e Node encontrados no ambiente, verificar as portas e usar os nomes de configuração já conhecidos pela função Python.
  - `start-local.ps1` fixava caminhos de instalação e a versão do JAR, e informava sucesso antes de os serviços abrirem as portas.
  - O script, `application.properties` e a função Python repetiam o mapeamento de credenciais.
- Expor uma operação de resposta independente do servidor HTTP e usá-la nos handlers local e Vercel.
  - O primeiro adaptador local chamava métodos internos do handler Vercel; uma mudança nesses métodos poderia quebrar apenas a execução local.
- Remover dependências Angular não usadas e texto de rascunho do README.
  - `@angular/forms` e `@angular/router` não são importados pelo aplicativo.
  - O script `watch` não é usado pelo fluxo de build ou execução.
  - As linhas `# teste` não documentam o projeto.

## Casos especiais mantidos

- Nomes antigos de variáveis de ambiente: o projeto Vercel já os usa; remover o suporte quebraria a implantação.
- Repetir a consulta após 401: o JWT pode expirar entre as páginas.
- Limite de 1000 páginas: protege contra cursor que não avança.
- Erro genérico para falhas inesperadas: impede que detalhes da infraestrutura e credenciais apareçam na resposta pública.

## Fora do escopo escolhido

As ações opcionais **Comments** e **Tests** da skill não foram selecionadas. O teste Angular gerado pelo scaffolding ainda contém uma expectativa antiga e será tratado quando houver pedido para revisar testes.
