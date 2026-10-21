# Conferir leituras do Firestore - 20/10/2026

Lembrete para comparar o uso real do Firestore depois de um dia de uso normal do MotoFix.

## Baixar o registro local

No mesmo navegador e perfil em que o aplicativo foi usado, abra `https://appmotofix.web.app/`, entre na conta e abra o Console do navegador (`F12` > Console). Execute:

```js
window.__motofixFirestoreDebug.download();
```

O navegador baixará `motofix-firestore-read-log.json`. Compartilhe esse arquivo para analisarmos os listeners, snapshots e consultas pontuais observados.

## Comparar com o Console Firebase

No projeto `appmotofix`, consulte Firestore > Usage Insights e Query Insights para o mesmo período de 24 horas. Compare principalmente `products`, `operational_logs` e quaisquer outras coleções que apareçam com volume alto.

O campo `estimatedServerReads` do JSON é uma estimativa do cliente, não a contagem faturada exata; compare-o com os painéis do Firestore. O registro é salvo localmente, não envia telemetria e não grava dados no Firestore.

Depois de baixar o arquivo, desative a coleta no Console do navegador:

```js
window.__motofixFirestoreDebug.disable();
```
