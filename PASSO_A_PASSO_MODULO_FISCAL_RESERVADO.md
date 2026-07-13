# Passo a passo - Modulo fiscal reservado

Objetivo: evoluir e testar o modulo fiscal sem atrapalhar o uso real do MotoFix.

Hoje o app em producao no Firebase Hosting funciona como site estatico. O modulo fiscal precisa de backend porque usa token Focus NFe, certificado digital, Firebase Admin e chamadas server-side. Por isso, a tela existe, mas as rotas `/api/fiscal/...` em producao ainda nao respondem como API.

## Situacao atual

- App principal em producao: funcionando.
- Regras Firestore: publicadas.
- Hosting: publicado.
- Backend fiscal local: funciona em `npm run dev`.
- API fiscal em producao: ainda nao existe atras do Hosting.
- Emissao implementada no codigo: NFS-e.
- NF-e e NFC-e: aparecem como estrutura preparada, mas ainda nao estao completas.

## Regra de seguranca do projeto

Nada do fiscal deve bloquear:

- Clientes
- Mercadorias
- Estoque
- Lancamentos Caixa
- Relatorios
- Historico
- Backups

O fiscal deve ficar como area reservada/beta ate ser validado.

## Ordem recomendada

### 1. Criar uma flag para esconder/liberar o modulo fiscal

Criar uma chave de configuracao para controlar quem ve e usa o modulo fiscal.

Sugestao:

```env
VITE_FISCAL_MODULE_ENABLED=false
VITE_FISCAL_API_URL=
```

Comportamento esperado:

- Se `VITE_FISCAL_MODULE_ENABLED=false`, o modulo Fiscal fica oculto ou bloqueado.
- Se `true`, aparece apenas para usuario admin/teste.
- Mesmo ligado, o fiscal nao deve emitir automaticamente por O.S. no primeiro momento.

Status: pendente.

Status no codigo: concluido. Foram criadas as flags `VITE_FISCAL_MODULE_ENABLED` e `VITE_FISCAL_BETA_EMAILS`. Com a flag desligada, o Fiscal fica fora dos menus e a emissao automatica por O.S. nao roda.

### 2. Separar o backend fiscal em ambiente de homologacao

Precisamos publicar o backend Express atual em um ambiente proprio.

Opcoes:

- Cloud Run
- Firebase Functions
- Servidor VPS

Sugestao inicial: Cloud Run, porque aceita o backend Express atual com menos mudanca.

O backend fiscal precisa receber estas variaveis:

```env
NODE_ENV=production
PORT=8080
FIREBASE_SERVICE_ACCOUNT_PATH=/secrets/firebase-service-account.json
FOCUS_NFE_HOMOLOGATION_URL=https://homologacao.focusnfe.com.br
FOCUS_NFE_PRODUCTION_URL=https://api.focusnfe.com.br
FOCUS_NFE_TIMEOUT_MS=20000
FISCAL_BODY_LIMIT=6mb
FISCAL_COMPANY_WRITE_RATE_LIMIT_PER_10_MINUTES=20
FISCAL_CERTIFICATE_RATE_LIMIT_PER_15_MINUTES=3
FISCAL_NFSE_RATE_LIMIT_PER_5_MINUTES=12
```

Importante:

- O service account nao deve ir para GitHub.
- Token Focus NFe nao deve ficar no frontend.
- Certificado A1 nao deve ficar em arquivo publico.

Status: pendente.

### 3. Configurar o frontend para chamar a API fiscal separada

Depois que o backend fiscal estiver publicado, configurar:

```env
VITE_FISCAL_API_URL=https://url-da-api-fiscal
VITE_FISCAL_MODULE_ENABLED=true
```

Depois rodar:

```bash
npm run build
firebase deploy --only hosting
```

Status: pendente.

### 4. Testar somente health e autenticacao

Antes de emitir qualquer nota:

```bash
GET /api/fiscal/health
GET /api/fiscal/companies
```

Resultado esperado:

- `/api/fiscal/health` retorna JSON com `status: ok`.
- `/api/fiscal/companies` sem login retorna `401`.
- Com login valido retorna lista de empresas fiscais.

Status: pendente em producao.

Status no codigo: concluido para teste local. Use `npm run test:fiscal` para validar health, bloqueio sem token, payload NFS-e e mapeamento de status sem emitir nota real.

### 5. Testar cadastro da empresa fiscal em homologacao

Na tela Fiscal:

- Ambiente: Homologacao
- Razao social
- CNPJ
- Inscricao municipal
- Codigo do municipio
- Cidade/UF
- Token Focus NFe de homologacao
- Certificado A1 e senha, se exigido pela Focus/prefeitura

Resultado esperado:

- Empresa salva no Firestore.
- Token fica em `fiscal_private`.
- Log `fiscal_company_saved`.
- Se chamar a Focus, log `focus_company_upserted`.

Status: pendente.

### 6. Testar emissao manual NFS-e em homologacao

Usar valor pequeno e cliente teste.

Campos minimos:

- Cliente
- Servico
- Valor
- Codigo do servico municipal, se necessario
- Aliquota ISS, se necessario

Resultado esperado:

- Cria registro em `fiscal_invoices`.
- Envia solicitacao para Focus.
- Grava retorno da Focus.
- Cria log fiscal.
- Status pode ficar `queued`, `processing`, `authorized` ou `rejected`.

Status: pendente.

### 7. Testar sincronizacao da NFS-e

Depois de emitir:

- Clicar em sincronizar.
- Conferir status atualizado.
- Conferir mensagem da Focus.

Resultado esperado:

- Status atualizado em `fiscal_invoices`.
- Log `nfse_synced`.

Status: pendente.

### 8. Testar XML/PDF

Depois de autorizada:

- Baixar XML.
- Baixar PDF.

Resultado esperado:

- Se o arquivo for pequeno, fica salvo em `fiscal_invoice_files`.
- Se for grande, fica apenas disponivel via URL remota e gera log de alerta.

Status: pendente.

### 9. Testar cancelamento em homologacao

Cancelar apenas nota teste.

Resultado esperado:

- Status `cancelled`.
- Campo `cancelledAt` preenchido.
- Log `nfse_cancelled`.

Status: pendente.

### 10. Liberar emissao por O.S. apenas depois da emissao manual funcionar

So ligar emissao por O.S. depois que estes itens passarem:

- API fiscal publicada.
- Empresa fiscal cadastrada.
- Emissao manual autorizada.
- Sincronizacao funcionando.
- XML/PDF baixando.
- Cancelamento testado.

Comportamento esperado por O.S.:

- So permite emitir se O.S. estiver `Finalizado`.
- O.S. cancelada nao deve emitir.
- O.S. em lancamento nao deve emitir.
- Ao emitir, grava `fiscalInvoiceId`, `fiscalReference` e `fiscalIssuedAt`.

Status: pendente.

Status no codigo: protegido. A emissao por O.S. fica bloqueada quando o modulo fiscal reservado nao estiver habilitado.

## O que eu consigo fazer no codigo

Posso preparar agora:

1. Criar flag `VITE_FISCAL_MODULE_ENABLED`.
2. Esconder/bloquear a aba Fiscal quando a flag estiver desligada.
3. Criar aviso visual de "Modulo fiscal em homologacao".
4. Garantir que emissao automatica por O.S. fique desligada por padrao.
5. Criar script de teste local do modulo fiscal sem emitir nota real.
6. Criar checklist de testes no proprio repo.
7. Preparar Dockerfile/Cloud Run para publicar a API fiscal separada.

Status atual do que ja foi feito:

- Flag do modulo fiscal: concluida.
- Navegacao desktop/mobile escondendo Fiscal quando desligado: concluida.
- Protecao contra acesso direto ao view `fiscal` quando desligado: concluida.
- Emissao automatica fiscal por O.S. desligada quando modulo fiscal esta off: concluida.
- Script local `npm run test:fiscal`: concluido.
- Publicacao da API fiscal separada: pendente.
- Configuracao real de `VITE_FISCAL_API_URL`: pendente.
- Base para Cloud Run: preparada com `Dockerfile.fiscal` e `.dockerignore`.

## O que depende de configuracao externa

Estes itens precisam de decisao/acesso:

1. Onde hospedar a API fiscal: Cloud Run, Firebase Functions ou VPS.
2. Token Focus NFe de homologacao.
3. Dados fiscais reais/teste da empresa.
4. Certificado A1, se a Focus/prefeitura exigir no teste.
5. Confirmacao de quais usuarios podem acessar o fiscal beta.

## Sugestao de caminho seguro

Fase 1:

- Ativar flag e esconder o modulo fiscal em producao.
- Criar teste automatizado local.
- Manter app principal intocado.

Fase 2:

- Publicar API fiscal separada em homologacao.
- Configurar `VITE_FISCAL_API_URL`.
- Testar health, auth e cadastro.

Fase 3:

- Emitir NFS-e manual em homologacao.
- Sincronizar.
- Baixar XML/PDF.
- Cancelar nota teste.

Fase 4:

- Liberar emissao por O.S. para usuario admin.
- Depois liberar para assinante fiscal.

## Comando local de teste atual

Rodar o servidor:

```bash
npm run dev
```

Testar health:

```bash
curl http://localhost:3000/api/fiscal/health
```

Resultado esperado:

```json
{
  "status": "ok",
  "provider": "focus-nfe",
  "models": ["nfse", "nfe", "nfce"],
  "firebaseInitialized": true
}
```

## Observacao importante

O modulo fiscal deve comecar sempre em homologacao. Producao fiscal so deve ser ligada depois que uma nota teste for emitida, consultada, baixada e cancelada corretamente.
