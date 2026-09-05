# MotoFix — Checkpoint Pré-LIVE
Data: 04/09/2026

## Estado atual

Branch:
fix/week1-professionalization

Último commit atual:
e873c24 — security: remove expired test token artifact

## Stripe / Billing

Estado: VALIDADO EM TESTE

- Checkout TEST: validado
- Ativação automática via webhook: validada
- Customer ↔ Firebase UID: validado
- Proteção contra checkout duplicado: validada
- Idempotency key: validada
- Customer Portal: validado
- Cancelamento no fim do período: validado
- Logout/login com cancelamento agendado: validado
- Preservação de currentPeriodEnd: corrigida e validada
- Payload parcial não apaga billing: validado
- inactive artificial eliminado: validado

Testes Stripe:
31/31 PASS
EXIT CODE = 0

## Subscription / Access Gate

- usuário sem assinatura: bloqueado
- active + período futuro: liberado
- active + cancelAtPeriodEnd + período futuro: liberado
- período expirado: bloqueado
- canceled: bloqueado
- timer de expiração: implementado
- sessão aberta atravessando vencimento: coberta por teste
- logout/login após expiração: bloqueio validado
- bypass por view interna: não encontrado

Testes:
12/12 PASS
EXIT CODE = 0

## Validação do projeto

LINT:
EXIT CODE = 0

BUILD:
EXIT CODE = 0

## Expiração REAL com Stripe Test Clock

Teste real executado em Stripe TEST.

Fluxo comprovado:

Stripe Test Clock
→ Customer TEST
→ Subscription TEST
→ cancel_at_period_end=true
→ avanço do relógio
→ customer.subscription.deleted
→ webhook local HTTP 200
→ Firestore atualizado
→ billing.status = canceled
→ subscription.status = canceled
→ isActive = false

Resultado:
EXPIRAÇÃO NO BACKEND = PASS

## Segurança

- cartão 4242 em runtime: não encontrado
- bypass de pagamento em runtime: não encontrado
- dev auth bypass: não encontrado
- PIN administrativo legado: não encontrado
- .env ignorado pelo Git: confirmado

Artefato antigo removido do HEAD:
scripts/cliente-removido-test-token.json

Observação:
o token antigo era um Firebase Custom Token expirado do projeto antigo motofix-2-local.
O arquivo ainda existe em histórico antigo, mas foi removido do HEAD atual.
Não foi feita reescrita de histórico.

## Cloud Run

Auditoria concluída.

Backend Express:
- PORT: OK
- 0.0.0.0: OK
- /api/health: OK
- serving dist em production: OK
- Dockerfile tecnicamente compatível: OK

Antes do primeiro LIVE:
- WhatsApp automático deve permanecer desabilitado no serviço web
- WHATSAPP_SCHEDULER_ENABLED=false
- AUTOMATIC_BACKUP_ENABLED=false
- links wa.me continuam funcionando
- Firebase Admin preparado para ADC
- backend pode ser executado no Cloud Run

## WhatsApp

IMPORTANTE:
O produto atualmente usa WhatsApp principalmente como link rápido.

A automação existente foi identificada no backend e deve permanecer DESABILITADA no primeiro LIVE.

Não remover agora:
- WhatsAppSessionService
- QR
- rotas antigas

Apenas não registrar/iniciar automação em produção.

## Backup

Backup automático local identificado em automaticBackup.ts.

Para o primeiro LIVE:
- desabilitar no serviço web
- migrar futuramente para Firebase Storage/Cloud Storage

## Google Cloud / Cloud Run

Google Cloud CLI foi instalado.

Problema atual:
o PowerShell do VS Code ainda não reconhece gcloud porque o PATH dessa sessão não foi recarregado.

O gcloud init foi iniciado em uma janela CMD e o login foi feito com:

6snailiw@gmail.com

ATENÇÃO:
Essa conta não é necessariamente a conta responsável pelo projeto correto.

O gcloud init chegou à seleção de projetos.
Nenhum projeto foi configurado.

Foi escolhida a opção:
11 — Enter a project ID

Mas foi digitado "exit", causando erro porque não era um Project ID válido.

Nada foi criado no Google Cloud.

O ambiente não deve ser configurado até confirmar a conta Google correta e o Project ID correto do Firebase appmotofix.

## Ponto EXATO para continuar amanhã

1. Abrir um NOVO PowerShell/CMD.
2. Confirmar que gcloud está disponível.
3. Conferir a conta autenticada.
4. Entrar com a conta Google responsável pelo projeto ppmotofix, se necessário.
5. Identificar o Project ID real do Firebase ppmotofix.
6. Configurar o projeto correto no gcloud.
7. Verificar APIs:
   - Cloud Run
   - Artifact Registry
   - Secret Manager
   - Cloud Build
8. Só então preparar o Cloud Run.
9. Primeiro deploy será com Stripe TEST.
10. Só depois migrar para Stripe LIVE.

## IMPORTANTE — NÃO FAZER AINDA

Não:
- fazer deploy LIVE
- usar sk_live_
- criar webhook LIVE
- alterar Stripe LIVE
- escolher projeto Google Cloud aleatoriamente
- usar a conta Google errada
- adicionar arquivos cleanup-*.json ao Git
- adicionar npm-dev.err ao Git

## Arquivos locais ainda não rastreados

Não adicionar sem análise:

cleanup-dry-run-report.json
cleanup-ega-execution-report.json
firebase-auth-admin-diagnostic.json
npm-dev.err
stripe-reconciliation-report.json

## Último checkpoint Git

Commit:
e873c24

Mensagem:
security: remove expired test token artifact

Branch:
fix/week1-professionalization

Próximo passo:
CONFIGURAR GOOGLE CLOUD / CLOUD RUN

