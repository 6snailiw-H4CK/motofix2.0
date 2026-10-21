# MotoFix 2.0

Sistema web para gestao de oficinas de motocicletas. O app centraliza clientes, servicos, recorrencias de manutencao, agenda, garantias, gastos, lembretes por WhatsApp, dashboard financeiro e administracao de usuarios.

## Documentacao

- `docs/GUIA_NAVEGACAO_CODIGO.md`: auditoria tecnica e indice atual para localizar views, chamadas, APIs, colecoes e regras.
- `DOCUMENTACAO.md`: memoria tecnica viva, plano de refatoracao e pendencias atuais.
- `OFFLINE_SYNC.md`: estrategia de uso offline, cache e sincronizacao.
- `PLANO_VENDAS_MOTOFIX.md`: plano comercial atual.
- `docs/archive/`: relatorios antigos, auditorias e planos historicos que sairam da raiz.
- `README.md`: guia rapido para rodar e entender o projeto.

## Stack

- Frontend: React 19, TypeScript, Vite e Tailwind CSS 4.
- Backend: Node.js com Express.
- Auth e banco: Firebase Authentication e Firestore.
- Pagamentos: Stripe no backend.
- Graficos: Recharts.
- PDF: jsPDF e html2canvas.
- UI: Lucide React e Sonner.

## Funcionalidades

- Login com Google via Firebase Auth.
- Cadastro e acompanhamento de clientes.
- Registro de servicos e historico de manutencoes.
- Calculo automatico de proxima manutencao por recorrencia.
- Status de manutencao: `OK`, `WARNING` e `OVERDUE`.
- Agenda de atendimentos.
- Controle de garantias com geracao de PDF.
- Controle de gastos em `users/{uid}/expenses`.
- Dashboard financeiro com receita, contas a receber, despesas e lucro liquido.
- Lembretes via link do WhatsApp com log em `message_logs`.
- Painel admin para ativar/bloquear usuarios e ajustar vencimento de assinatura.

## Configuracao local

Crie um arquivo `.env` baseado em `.env.example`.

Variaveis principais:

```env
VITE_FIREBASE_API_KEY=
VITE_FIREBASE_AUTH_DOMAIN=
VITE_FIREBASE_PROJECT_ID=
VITE_FIREBASE_STORAGE_BUCKET=
VITE_FIREBASE_MESSAGING_SENDER_ID=
VITE_FIREBASE_APP_ID=

STRIPE_PUBLISHABLE_KEY=
STRIPE_SECRET_KEY=
STRIPE_WEBHOOK_SECRET=
STRIPE_PRICE_ID=

FIREBASE_SERVICE_ACCOUNT_PATH=./firebase-service-account.json
NODE_ENV=development
PORT=3001
VITE_STRIPE_API_URL=http://localhost:3001
CORS_ORIGINS=http://localhost:3001,http://127.0.0.1:3001
JSON_BODY_LIMIT=512kb
FISCAL_BODY_LIMIT=6mb
WEBHOOK_BODY_LIMIT=2mb
FOCUS_NFE_TIMEOUT_MS=20000
```

## Comandos

```bash
npm install
npm run dev
npm run lint
npm run build
npm run start
```

## Painel Master Admin independente

Com o servidor local iniciado em `npm run dev`, acesse `http://localhost:3001/master-admin.html`. O painel tem entrada, autenticação e shell próprios e reutiliza o Firebase Auth e as APIs administrativas existentes. A tela só é liberada após a API confirmar a autorização Master Admin; autenticar no Firebase, por si só, não concede acesso.

## Estrutura de dados

Os dados operacionais ficam em subcolecoes por usuario:

```text
users/{uid}
users/{uid}/clients
users/{uid}/maintenances
users/{uid}/warranties
users/{uid}/appointments
users/{uid}/expenses
users/{uid}/products
users/{uid}/cash_launches
users/{uid}/message_logs
users/{uid}/settings/config
```

As Rules não permitem leitura geral de `/users` nem acesso administrativo às subcoleções operacionais de outras contas.

### Solicitações de acesso manual

Novos cadastros criam, em um único batch Firestore, um perfil inativo com `role: "user"` e `access_requests/{uid}`. A solicitação contém somente UID, e-mail autenticado, nome de exibição, estado e timestamp; começa como `pending`. Claims administrativas não fazem o próprio cadastro nascer aprovado.

As Rules permitem a consulta administrativa somente de solicitações `pending`, por uma conta com claim assinada `master_admin` e perfil `master_admin` ativo. Aprovar, bloquear, liberar ou renovar exige uma única operação atômica que atualize `access_requests/{uid}` e `users/{uid}` e crie `access_decisions/{eventId}`. As Rules validam a transição, ator, estado anterior/posterior, entitlement manual com vencimento e projeção correspondente. A auditoria é imutável e não pode ser criada isoladamente, alterada, apagada nem lida pelo cliente; mudanças de role, claims, Stripe, billing e `ownerAccess` não fazem parte desse fluxo.

O catálogo inclui contas com role `user` ou `admin` que tenham um documento `access_requests` cujo ID e campo `uid` correspondam ao ID do perfil, e cujo estado seja `pending`, `approved` ou `blocked`. A conta proprietária designada e contas `master_admin` são operadores, não alvos de concessão comercial. Perfis legados elegíveis sem solicitação correspondente não aparecem no painel; roles desconhecidas, solicitações órfãs, IDs divergentes e estados fora do conjunto consultado exigem revisão antes de qualquer ativação.

Antes da implantação, a cobertura pode ser auditada com um procedimento Admin SDK estritamente somente leitura. Ele pagina `/users` e `/access_requests` por ID de documento, exige projeto e principal explicitamente confirmados e imprime somente contagens e referências hash truncadas — nunca UID, e-mail ou claims. Se as credenciais locais já tiverem autorização de leitura no projeto `appmotofix`, configure os três valores a partir de fontes autorizadas:

```powershell
$env:MOTOFIX_FIREBASE_PROJECT_ID = "appmotofix"
$env:MOTOFIX_FIREBASE_EXECUTION_PRINCIPAL = "<principal esperado, confirmado por fonte autorizada>"
$env:MOTOFIX_FIREBASE_SERVICE_ACCOUNT_PATH = "<caminho local protegido da service account autorizada>"
npm run admin:audit-access-catalog -- --expected-project appmotofix --confirm-project appmotofix
```

O script aborta diante de projeto/principal divergente, emulator ou configuração ambígua. A consulta usa Admin SDK, portanto precisa de credencial autorizada e não é limitada pelas Firestore Rules; o código executa somente leituras e não corrige, cria ou apaga documentos. Não execute até conferir independentemente o projeto e o principal.

## Acesso permanente do proprietário

O acesso operacional e a role administrativa são políticas separadas. `master_admin` sozinho não concede acesso ao app. A identidade proprietária autoritativa é `system/access_config.ownerUid`, gerenciada somente por Admin SDK. A conta precisa coincidir com esse UID e ter `isActive: true`, role `master_admin`, entitlement persistido `ownerAccess: { enabled: true, permanent: true }`, claim assinada `motofix_owner` e projeção `source: "owner"` com `validUntil: null`. Backend, Cloud Functions e Rules falham fechados quando o documento está ausente ou inválido; as Rules comparam também o UID autenticado diretamente com o documento, portanto a claim isolada não autoriza. A sincronização de claims/projeções é derivada dessa configuração e não concede `ownerAccess`. `manualAccess.expiresAt: null` não significa acesso permanente.

Concessões e revogações são feitas pelo script administrativo, não pelo frontend nem pelo endpoint de acesso manual. Ele exige confirmação do projeto Firebase, valida que o ator é um Master Admin ativo e verifica o alvo contra `system/access_config.ownerUid` dentro da transação. O script registra `actor`, alvo, estado anterior/novo, motivo e timestamp em `audit_events`. Ao conceder owner access, ele também remove o entitlement manual temporário emergencial e seu espelho legado; essa transição fica registrada no mesmo evento. A configuração de identidade não é definida por esse script.

```powershell
$env:MOTOFIX_FIREBASE_PROJECT_ID = "<projeto-firebase-confirmado>"
node --import tsx scripts/set-owner-access.ts grant <uid-do-ator-master-admin> <uid-do-proprietario-designado> "Motivo aprovado"
```

### Provisionamento inicial da identidade canônica

O provisionamento é uma operação distinta de `set-owner-access.ts`. O operador deve confirmar o UID por uma fonte institucional independente, obter referências de identidade e aprovação e revisar projeto, credencial e principal de execução antes de iniciar. As referências são texto fornecido pelo operador: o programa não consulta nem valida os registros referenciados. O operador precisa verificar ambos por canais externos autorizados; a confirmação digitada registra apenas essa declaração e não é prova automática de aprovação. O comando exige caminho explícito para a service account, projeto esperado e principal esperado; recusa ADC, configuração conflitante, Emulator e Apps Admin já inicializados. Esses checks comparam a configuração declarada localmente e não provam, por si sós, a identidade remota aceita pelo Google.

Para a autorização operacional do proprietário, o código atual usa o UID de Auth designado no repositório e exige, além da autenticação, `isActive=true`, `role=master_admin` e `ownerAccess.enabled/permanent=true`. Essa verificação não depende de `system/access_config` nem da claim `motofix_owner`; Rules não permitem que o cliente altere esses campos no perfil existente. A política só terá efeito depois que as Rules e qualquer backend usado pela aplicação forem publicados. A implementação local, isoladamente, não comprova a restauração do acesso.

Em terminal interativo, o script solicita o UID duas vezes, as referências de identidade e aprovação, um motivo, a frase `REFERENCES VERIFIED EXTERNALLY` e a frase literal `PROVISION MOTOFIX OWNER IDENTITY`. A operação valida o perfil existente sem alterar role, estado da conta, `ownerAccess` ou billing; cria `system/access_config` quando ausente ou preenche somente `ownerUid` quando esse campo está ausente; e recalcula a projeção do proprietário. Por segurança, antes de qualquer escrita ela exige que `motofix_owner` já esteja definida como `true`. O Firebase Admin SDK substitui o conjunto completo de custom claims e não oferece compare-and-set; portanto, o script não tenta definir a claim, pois uma releitura antes da escrita não impediria a sobrescrita concorrente de outras claims. Se a claim estiver ausente ou falsa, o procedimento aborta antes de ler ou escrever Firestore. Claims não são alteradas por este comando.

Firestore e Authentication não são transacionais em conjunto. A claim é lida antes da operação e conferida novamente após a sincronização Firestore; a auditoria mantém estado pendente, sucesso ou falha e contador de tentativas, e uma nova execução com as mesmas referências retoma o mesmo evento. O sucesso significa apenas que a configuração/projeção Firestore foi sincronizada e que a claim existente foi observada como correta; não comprova acesso operacional, nem a autorização pelo backend publicado ou pelas Firestore Rules. Depois de eventual execução bem-sucedida, o operador ainda precisa renovar o ID token, validar `/api/account/access` e verificar o acesso real protegido pelas Rules. O procedimento não depende de Cloud Functions implantadas.

O núcleo local pode ser testado sem Firebase:

```powershell
npm run test:owner-identity-provisioning
```

Antes de qualquer execução real, revise `scripts/provision-owner-identity.ts` e `server/provisionOwnerIdentity.ts`; confirme o projeto e o principal por procedimento institucional, valide externamente a fonte independente do UID e a aprovação registrada, e obtenha autorização operacional separada. O comando não consegue validar esses registros e não sincroniza a claim se ela ainda não estiver correta. Não execute o comando como parte dos testes:

```powershell
$env:MOTOFIX_FIREBASE_PROJECT_ID = "<projeto-confirmado>"
$env:MOTOFIX_FIREBASE_EXECUTION_PRINCIPAL = "<principal-da-service-account-aprovado>"
$env:MOTOFIX_FIREBASE_SERVICE_ACCOUNT_PATH = "<caminho-local-protegido>"
npm run admin:provision-owner-identity
```

## Firestore Rules

As regras atuais foram endurecidas para:

- negar qualquer acesso anonimo;
- permitir que usuarios ativos acessem apenas as proprias subcolecoes;
- permitir que usuarios leiam o proprio perfil;
- permitir auto-bloqueio do proprio usuario quando a assinatura expira;
- permitir acesso admin via custom claim `admin`;
- validar schema/tipos basicos das colecoes principais do usuario antes de writes do frontend;
- bloquear escrita direta do frontend em campos fiscais sensiveis e colecoes privadas de XML/PDF/certificados;
- negar qualquer outro documento fora de `users/{uid}`.

Antes de producao, aplique as regras no Firebase e renove o token dos admins apos configurar a custom claim. As regras devem ser publicadas junto com Hosting quando houver mudanca de schema ou permissao.

## Diagnostico local de leituras do Firestore

O diagnóstico temporário registra no `localStorage` do navegador a criação de listeners, snapshots recebidos, documentos adicionados/alterados/removidos e leituras de consultas pontuais. Ele não envia telemetria nem grava dados no Firestore. Para ativá-lo na versão publicada, abra o Console do navegador no app e execute:

```js
window.__motofixFirestoreDebug.enable();
location.reload();
```

Use o aplicativo normalmente. Para baixar o resumo diário, execute:

```js
window.__motofixFirestoreDebug.download();
```

Depois da coleta, desative com `window.__motofixFirestoreDebug.disable()`. O campo `estimatedServerReads` é uma estimativa baseada nos snapshots observados pelo cliente; cache persistente, reconexões e regras de cobrança de listeners podem fazer esse valor divergir das leituras faturadas. Compare-o com Usage Insights/Query Insights do Firestore. Os registros locais são limitados a 14 dias e não incluem UID ou conteúdo de documentos.

## Acesso e cobrança manual

O acesso operacional é concedido pelo Master Admin por uma decisão manual, após verificar o pagamento fora do aplicativo. A data de vigência é gravada como entitlement manual e é aplicada tanto pelo gate da interface quanto pelas Firestore Rules. O status Stripe legado não concede, renova nem revoga acesso.

O Master Admin usa somente os documentos mínimos de `access_requests` e decisões auditadas; ele não lista nem lê a coleção `/users`. As decisões de ativação, renovação e suspensão atualizam solicitação, perfil protegido e auditoria em uma única gravação atômica validada pelas Rules. Contas antigas sem documento em `access_requests` não aparecem nesse catálogo.

O fluxo manual para novos cadastros e contas que já possuam solicitação válida não depende da ferramenta `accessProjection` backfill: a decisão administrativa grava entitlement, projeção e auditoria em conjunto. Perfis legados ausentes do catálogo precisam primeiro de um procedimento específico, revisado e auditado; o backfill de projeções não cria solicitações e não deve ser usado como substituto. Concessões legadas com solicitação existente mas campos/projeção divergentes também precisam ser revisadas; uma renovação manual autorizada pode atualizar o conjunto quando a transição permitida pelas Rules se aplica.

O checkout, portal, cancelamento e webhook Stripe ficam desativados no servidor e na interface. Os módulos e campos Stripe históricos permanecem no repositório para consulta/migração, mas não são fonte de autorização. Não há confirmação automática de PIX: comprovantes enviados pelo cliente não liberam acesso.

## Segredos

Nunca versione arquivos sensiveis:

- `.env`
- `.env.*`
- `firebase-service-account.json`
- qualquer arquivo `*.credentials.json`

O arquivo `firebase-service-account.json` deve ficar fora do Git e, em producao, idealmente deve ser substituido por secrets do ambiente de deploy.

## Backend Express

O servidor aplica headers basicos de seguranca, CORS por allowlist, limite de payload, rate limit simples em `/api` e timeout nas chamadas Focus NFe.

Em producao, configure `APP_URL`, `FRONTEND_URL` ou `CORS_ORIGINS` com os dominios reais do frontend quando ele estiver em origem diferente do backend.

## Build e deploy

O build gera dois artefatos separados:

- `dist/`: frontend que pode ser publicado no Firebase Hosting.
- `dist-server/`: bundle do servidor Express, fora da pasta publica do Hosting.

```bash
npm run build
```

No Windows, esse comando aplica uma configuracao de memoria para reduzir falhas ocasionais do esbuild durante o build.

O Firebase Hosting serve `dist` e reescreve as rotas para `index.html` (SPA). Nao ha rewrite
`/api/**` ativo no Hosting; os endpoints de API precisam de uma URL publica configurada
separadamente antes de serem usados em producao. O painel Master Admin nao depende dessa API:
lista solicitacoes e grava decisoes diretamente no Firestore, sob autorizacao das Firestore
Rules. A colecao de perfis nao e enumerada; a leitura de perfil e individual e restrita a um
Master Admin ativo. Cada liberacao, renovacao ou suspensao grava o perfil, a solicitacao e o
historico imutavel em um unico lote; liberacoes registram plano, valor e confirmacao de pagamento.

### Backend de producao no Cloud Run

O container do backend usa Application Default Credentials; nao inclua chave JSON de conta de
servico na imagem. O Dockerfile compila apenas o servidor Express, executa como usuario nao-root
e desativa o scheduler de backup local: o filesystem do Cloud Run e efemero, portanto esse
scheduler nao pode ser usado como armazenamento de backup. Mantenha o fluxo de backups
persistentes configurado separadamente antes de depender dele em producao.

O projeto Firebase usado atualmente e `appmotofix` e a regiao do Firestore e
`southamerica-east1`. O backend Cloud Run e uma opcao separada e nao e ativado pelo deploy do
Hosting descrito acima. Para usa-lo, um administrador do Google Cloud precisa habilitar a API
do Cloud Run e configurar faturamento, permissoes e uma conta de servico de runtime com somente
os papeis necessarios para Firestore e Firebase Authentication.

Publique primeiro o backend no Cloud Run. Em seguida publique o rewrite de Hosting e confirme
`https://appmotofix.web.app/api/health`. As variaveis sensiveis (incluindo `STRIPE_SECRET_KEY` e
`STRIPE_WEBHOOK_SECRET`) devem vir do Secret Manager, nunca de argumentos com valores secretos
ou de arquivos enviados no build. Configure `APP_URL` e `FRONTEND_URL` como
`https://appmotofix.web.app`, e configure as URLs de retorno do Stripe para o dominio publicado.

Nao publique `firestore.rules` ate que a migracao das projecoes de acesso esteja validada em
todos os perfis e o cliente novo esteja atendendo producao. Para regras, use o comando separado
somente com autorizacao e verificacao previa:

```bash
npm run deploy:rules
```

## Operacao offline

A aplicacao agora possui cache persistente do Firestore, fila de escritas offline e service worker para abrir o app sem conexao depois do primeiro carregamento online. A documentacao completa esta em [`OFFLINE_SYNC.md`](./OFFLINE_SYNC.md).
