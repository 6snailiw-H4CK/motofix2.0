# Correcoes finais

Data de inicio: 2026-07-07

Objetivo: resolver os pontos criticos da auditoria de seguranca e preservacao de dados para reduzir risco de perda irreversivel.

## Status geral

- [x] Critico 1: bloquear delete fisico nas regras Firestore.
- [x] Critico 2: trocar reset operacional de delete fisico para arquivamento seguro.
- [x] Validacao final completa.

## Critico 1: Bloquear delete fisico nas regras Firestore

Status: concluido em 2026-07-08.

O que fazer:

- [x] Alterar `firestore.rules` para negar `allow delete` em colecoes operacionais.
- [x] Negar tambem delete fisico do documento `/users/{userId}` para evitar remocao direta de perfil.
- [x] Manter soft delete via `update` com `deletedAt`, `deletedBy`, `deletedReason`, `resetAt` e `resetId`.
- [x] Atualizar testes do emulador para garantir que `deleteDoc()` seja negado para owner e admin.
- [x] Atualizar validacao estatica para detectar `allow delete` perigoso.

Arquivos previstos:

- `firestore.rules`
- `scripts/firestore-rules-validation.mjs`
- `scripts/validate-firestore-rules.mjs`
- `scripts/firestore-rules-scenarios.mjs`
- `src/firebase.ts`

## Critico 2: Trocar reset operacional para arquivamento seguro

Status: concluido em 2026-07-08.

O que fazer:

- [x] Remover `batch.delete` da rota `/api/data-reset/operational`.
- [x] Arquivar documentos operacionais com metadata (`deletedAt`, `deletedBy`, `deletedReason`, `resetAt`, `resetId`).
- [x] Preservar clientes e apenas zerar campos operacionais, como ja era feito.
- [x] Retornar contadores de documentos arquivados, nao removidos.
- [x] Atualizar frontend para mensagem de "arquivado" em vez de "removido".

Arquivos previstos:

- `server/dataResetRoutes.ts`
- `src/services/operationalDataResetApi.ts`
- `src/hooks/useSettingsActions.ts`

## Validacao final

Status: concluido em 2026-07-08.

Comandos:

```bash
npm run lint
npm run build:server
npm run build:client
npm run test:offline
npm run test:rules:static
npm run test:rules:scenarios
npm run test:rules
```

Resultado:

- [x] `npm run lint`
- [x] `npm run build:server`
- [x] `npm run build:client`
- [x] `npm run test:offline`
- [x] `npm run test:rules:static`
- [x] `npm run test:rules:scenarios`
- [x] `npm run test:rules`
