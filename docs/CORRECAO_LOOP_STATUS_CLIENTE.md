# Correção do loop de status de cliente

## O que aconteceu

O sincronizador automático compara `nextMaintenanceDate` com o campo `status`. Quando encontra divergência, ele grava o status calculado. Para o cliente legado que não atendia às regras atuais, o Firestore aplicava a escrita localmente, recusava no servidor e revertia o documento. Cada reversão gerava um novo snapshot e uma nova tentativa imediata.

## Proteção incluída

`useClientStatusSync` agora registra uma recusa `permission-denied` por cliente/status e deixa de repetir a mesma tentativa durante a sessão. Uma mudança real de status ou uma atualização bem-sucedida libera o cliente novamente.

Essa proteção encerra o loop, mas não substitui a correção dos registros legados ou das regras publicadas.

## Migração segura de clientes legados

O script `scripts/normalize-legacy-clients.ts` só ajusta campos obrigatórios ausentes ou inválidos. Ele preserva os dados existentes e inicia em modo de simulação.

```powershell
npx tsx scripts/normalize-legacy-clients.ts --email 6snailiw@gmail.com
```

Revise a lista de IDs/campos proposta. Somente depois aplique:

```powershell
npx tsx scripts/normalize-legacy-clients.ts --email 6snailiw@gmail.com --apply
```

Pré-requisito: `FIREBASE_SERVICE_ACCOUNT_PATH` deve apontar para uma conta de serviço do projeto correto. O script usa Admin SDK e escreve diretamente no Firestore; execute primeiro em homologação ou faça backup do usuário antes de usar em produção.

## Ordem de publicação recomendada

1. Testar regras e migração no Emulator/homologação.
2. Executar o dry-run e validar os patches.
3. Criar backup do usuário afetado.
4. Aplicar a migração no ambiente alvo.
5. Publicar a regra compatível e o frontend com a proteção contra loop como um mesmo release.
6. Abrir o MotoFix, confirmar uma única tentativa/sincronização e verificar que não há novas falhas na fila offline.

Não limpe dados do navegador antes de verificar que não há operações offline legítimas pendentes.
