# Guia de recuperação do Stripe em ambiente de teste

Este guia serve para recuperar o checkout local do MotoFix quando a assinatura deixa de ser reconhecida, o Stripe CLI aponta para a conta errada ou uma chave de teste é revogada/rotacionada.

## Regra principal

O backend, o Stripe CLI, o Price e o cliente precisam pertencer à mesma conta Stripe em modo de teste.

Use sempre:

- Dashboard com o aviso **Área restrita** ou sandbox.
- `STRIPE_SECRET_KEY=sk_test_...` da mesma conta sandbox.
- `STRIPE_PRICE_PLAN_MONTHLY=price_...` criado nessa mesma conta.
- `STRIPE_WEBHOOK_SECRET=whsec_...` emitido pelo listener atual.

Nunca misture chaves de produção com Price, cliente ou webhook de teste.

## Sintomas comuns

- O botão **Assinar com Stripe** não abre o Checkout.
- O MotoFix mostra **Acesso Restrito** mesmo depois do pagamento.
- A tela volta para `?checkout=success`, mas o acesso não é liberado.
- O console mostra `409 Conflict`.
- O console mostra erro de assinatura do webhook.
- O diagnóstico mostra `billing.status: active`, mas `currentPeriodEnd: null`.

`?checkout=success` apenas indica que o navegador voltou para a URL de sucesso. A liberação depende do webhook recebido e gravado no Firebase.

## Procedimento completo

### 1. Confirmar o ambiente

No Dashboard do Stripe, confirme que está em **Área restrita** ou sandbox. Não clique em **Alternar para conta de produção**.

No terminal do projeto:

```powershell
Get-Location
stripe --version
```

### 2. Conferir as variáveis do `.env`

As variáveis principais são:

```dotenv
STRIPE_SECRET_KEY=sk_test_...
STRIPE_WEBHOOK_SECRET=whsec_...
STRIPE_PRICE_PLAN_MONTHLY=price_...
STRIPE_SUCCESS_URL=http://localhost:3001/?checkout=success
STRIPE_CANCEL_URL=http://localhost:3001/?checkout=cancel
VITE_STRIPE_API_URL=http://localhost:3001
PORT=3001
```

Se uma chave `sk_test_...` tiver sido revogada ou expirada:

1. Crie uma nova chave secreta de teste no Dashboard.
2. Substitua somente `STRIPE_SECRET_KEY` pelo novo valor.
3. Confirme que o Price mensal ainda pertence à mesma conta sandbox.
4. Não troque o `price_...` por um Price de produção.

A chave pública (`pk_test_...`) só precisa ser trocada se ela também tiver sido revogada ou se vier de outra conta. O Checkout atual é criado pelo backend.

### 3. Iniciar o servidor

Em um terminal:

```powershell
npm run dev
```

Aguarde a mensagem de servidor escutando na porta `3001`. Se aparecer `EADDRINUSE`, já existe outro processo na porta. Verifique antes de iniciar outra instância:

```powershell
Get-NetTCPConnection -LocalPort 3001 -State Listen -ErrorAction SilentlyContinue
```

### 4. Iniciar o listener na mesma conta do backend

Em outro terminal, dentro do projeto, extraia a chave do `.env` sem imprimi-la e use-a explicitamente:

```powershell
$line = Get-Content .env | Where-Object { $_ -like 'STRIPE_SECRET_KEY=*' }
$key = $line -replace '^STRIPE_SECRET_KEY=', ''
stripe listen --api-key $key --forward-to localhost:3001/api/stripe/webhook
```

O listener deve exibir:

```text
Ready! ... Your webhook signing secret is whsec_...
```

Copie o `whsec_...` completo para `STRIPE_WEBHOOK_SECRET` no `.env`. Se o valor mudar ao iniciar uma nova sessão, use o valor da sessão atual.

Depois de alterar o `.env`, reinicie o `npm run dev`. O processo precisa ser reiniciado para carregar as novas variáveis.

### 5. Confirmar que CLI e backend usam a mesma conta

Com a variável `$key` ainda disponível no terminal:

```powershell
stripe customers list --api-key $key --limit 10
```

O cliente esperado deve aparecer nessa lista. Se a consulta sem `--api-key` mostrar uma conta vazia, isso não significa que os dados desapareceram: significa que o login padrão do CLI está em outra conta. Continue usando `--api-key $key`.

### 6. Testar uma assinatura existente

Se o cliente já possui uma assinatura ativa no Dashboard, não clique novamente em **Assinar com Stripe**. O backend retorna `409` de propósito para impedir duplicidade.

Use **Já paguei — confirmar assinatura** depois de o webhook atualizar o Firebase.

Se a assinatura está ativa no Stripe, mas o MotoFix mostra `currentPeriodEnd: null`, gere um evento `customer.subscription.updated` alterando uma propriedade reversível no Dashboard, por exemplo o cancelamento agendado. O listener deve registrar:

```text
--> customer.subscription.updated
<-- [200] POST http://localhost:3001/api/stripe/webhook
```

O servidor deve registrar também:

```text
[STRIPE] Webhook signature verified
[STRIPE] Billing updated
```

Depois recarregue o MotoFix.

### 7. Testar uma nova assinatura

Somente se não existir uma assinatura ativa para o cliente:

1. Clique em **Assinar com Stripe**.
2. Complete o Checkout usando um cartão de teste do Stripe, como `4242 4242 4242 4242`.
3. Use qualquer data futura e CVC de teste.
4. Aguarde os eventos no terminal do listener.
5. Volte ao MotoFix e confirme o acesso.

## Interpretação dos erros

| Sintoma | Causa provável | Ação |
|---|---|---|
| `409 Conflict` | Já existe assinatura ativa ou bloqueio de checkout recente | Não criar outra; confirmar a assinatura existente |
| `401 Token Firebase invalido` | Sessão do Google expirada | Sair, entrar novamente e testar |
| `400 Plano ou identidade...` | Price ausente ou identidade sem e-mail | Conferir login e `STRIPE_PRICE_PLAN_MONTHLY` |
| `Webhook signature unavailable` | `STRIPE_WEBHOOK_SECRET` ausente | Copiar o `whsec_...` do listener atual |
| `Webhook signature verification failed` | Segredo de outra sessão/conta | Reiniciar listener com `--api-key $key` e atualizar o `.env` |
| `EADDRINUSE :3001` | Já existe servidor na porta | Usar o processo existente ou encerrá-lo antes de reiniciar |
| `currentPeriodEnd: null` | Firebase não recebeu uma assinatura completa | Gerar `customer.subscription.updated` e confirmar o webhook |
| Checkout volta para `?checkout=success` sem acesso | Retorno não é confirmação de pagamento | Verificar listener, resposta `200` e documentos no Firebase |

## Checklist final

- [ ] Dashboard está em Área restrita/sandbox.
- [ ] `STRIPE_SECRET_KEY` começa com `sk_test_`.
- [ ] O Price mensal pertence à mesma conta da chave.
- [ ] O listener foi iniciado com `--api-key $key`.
- [ ] `STRIPE_WEBHOOK_SECRET` é o segredo do listener atual.
- [ ] O servidor foi reiniciado depois de alterar o `.env`.
- [ ] O listener recebeu o evento e respondeu `200`.
- [ ] O servidor registrou `Webhook signature verified`.
- [ ] O Firebase possui status ativo e `currentPeriodEnd` futuro.
- [ ] Não existem assinaturas duplicadas para o mesmo cliente.

## Segurança

Nunca publique `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET` ou `firebase-service-account.json`. Se uma chave apareceu em imagem, chat, commit ou log compartilhado, revogue-a no Dashboard e gere outra chave de teste. O arquivo `.env` deve permanecer fora do Git.

Para produção, este procedimento local não é suficiente: use uma URL HTTPS, um endpoint webhook permanente no Stripe e chaves `sk_live_...`/`pk_live_...` da conta de produção, sem misturar IDs de teste.
