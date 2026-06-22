# CEREBRO.md

## 1. Visão Geral

(Lembraremos de atualizar este arquivo à medida que a refatoração avança.)

## 2. Tech Stack

## 3. Estrutura de Diretórios

## 4. Regras de Negócio e Lógica

- `checkout` é um `AppView` suportado no frontend.
- O fluxo de pagamento usa Stripe Payment Element com `confirmPayment` e confirmações no frontend.
- O backend `server.ts` expõe `/api/payments/publishable-key`, `/api/payments/create-checkout` e `/api/payments/session/:sessionId`.
- A sessão de checkout é criada como `payment_intent` com `card` e `boleto`, usando o e-mail do usuário autenticado.
- A renovação de assinatura expirada agora direciona para a tela de checkout.

## 5. Convenções de Código

- Tela única por `AppView` gerenciada em `AppViewRenderer.tsx`.
- Tela de checkout é lazy-loaded em `src/components/layout/AppViewRenderer.tsx`.
- `SettingsView` dispara `onOpenCheckout` para mudar `view` para `checkout`.

## 6. TODO / Próximos Passos

- Depriorizar Stripe e WhatsApp por enquanto e focar na limpeza da orquestração de views e no fluxo de navegação principal.
- Extrair regras de assinatura expiradas para `useSubscriptionStatus` e reduzir lógica de decisão em `App.tsx`.
- Refatorar `AppViewRenderer.tsx` para separar renderização de telas e diminuir blocos condicionais.
- Garantir que usuário expirado possa chegar à renovação sem bloquear o app inteiro.
