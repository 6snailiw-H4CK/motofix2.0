# Relatorio da auditoria de seguranca e preservacao de dados

Data da auditoria: 2026-07-07

## Conclusao executiva

O sistema esta bem melhor protegido do que um CRUD comum: usa cache persistente do Firestore, pre-carga offline, fila local de escritas com retry, soft delete nos fluxos principais, exportacoes de backup e regras Firestore com validacao de dono/admin.

Mesmo assim, ainda nao da para afirmar que "nenhum dado sera perdido" com seguranca forte. Existem dois pontos criticos:

1. As regras Firestore ainda permitem delete fisico em varias colecoes do usuario.
2. A rota `/api/data-reset/operational` apaga fisicamente colecoes operacionais via Admin SDK.

Minha recomendacao: antes de tratar como blindado contra perda de dados, fechar esses dois pontos e adicionar backup automatico server-side com rotina de restauracao testada.

## Validacoes executadas

- [x] `npm run lint`
- [x] `npm run test:offline`
  - Resultado: `Offline resilience tests passed: 11 scenarios.`
- [x] `npm run test:rules:static`
  - Resultado: 8/8 verificacoes passaram.
- [x] `npm run test:rules:scenarios`
  - Resultado: cenarios de permissao revisados com sucesso.
- [x] `npm run test:rules`
  - Resultado: validacao completa no emulador Firestore finalizada com sucesso.
  - Observacao: a primeira tentativa dentro do sandbox falhou por `EPERM` ao Firebase CLI ler `firebase-tools.json`; a execucao fora do sandbox passou.

## Controles positivos encontrados

### 1. Cache persistente do Firestore

O app inicializa o Firestore com cache local persistente e tamanho ilimitado:

- `src/firebase.ts:49`
- `src/firebase.ts:50`

Isso reduz bastante risco de ficar sem dados ao abrir offline depois de ja ter carregado o app online.

### 2. Pre-carga offline de dados do usuario

Existe pre-carga de varias colecoes do usuario, com janela de stale de 24h:

- `src/services/offlineDataPreload.ts:5`
- `src/services/offlineDataPreload.ts:9`
- `src/services/offlineDataPreload.ts:126`
- `src/services/offlineDataPreload.ts:159`

Tambem ha reexecucao quando o usuario volta a ficar online ou retorna para a aba:

- `src/hooks/useOfflineDataPreload.ts:27`
- `src/hooks/useOfflineDataPreload.ts:59`

### 3. Fila offline com retry

As escritas passam por uma fila local com persistencia em `localStorage`, estado de pendencia/falha e replay:

- `src/services/firestoreOfflineQueue.ts:145`
- `src/services/firestoreOfflineQueue.ts:226`
- `src/services/firestoreOfflineQueue.ts:341`
- `src/services/firestoreOfflineQueue.ts:422`
- `src/services/firestoreOfflineQueue.ts:500`
- `src/services/firestoreWriteReplay.ts:32`

Existe painel para tentativas manuais de retry:

- `src/components/settings/FailedWritesPanel.tsx:29`

### 4. Soft delete nos fluxos normais

Os repositorios principais arquivam dados com metadata em vez de apagar fisicamente:

- Clientes/historico: `src/services/clientRepository.ts:66`
- Manutencoes: `src/services/maintenanceRepository.ts:37`
- Lancamentos caixa/O.S.: `src/services/cashRegisterRepository.ts:37`
- Mercadorias: `src/services/productRepository.ts:138`
- Garantias: `src/services/warrantyRepository.ts:42`
- Agendamentos: `src/services/appointmentRepository.ts:31`
- Gastos: `src/services/expenseRepository.ts:23`
- Logs de mensagem: `src/services/messageLogRepository.ts:10`

Tambem ha restore para a maioria dessas entidades.

### 5. Backup/exportacao manual

Existem exportacoes CSV e backup operacional JSON:

- `src/services/emergencyBackup.ts:54`
- `src/services/emergencyBackup.ts:70`
- `src/services/emergencyBackup.ts:103`
- `src/services/emergencyBackup.ts:126`
- `src/components/layout/AppViewRenderer.tsx:672`

### 6. Regras Firestore com isolamento por usuario

As regras validam usuario ativo, dono do documento e admin via claim/documento. Os testes estaticos, cenarios e emulador passaram.

## Achados criticos

### Critico 1: Regras permitem delete fisico direto

As regras Firestore permitem `allow delete` para donos ativos ou admins em colecoes operacionais:

- `firestore.rules:759`
- `firestore.rules:766`
- `firestore.rules:773`
- `firestore.rules:780`
- `firestore.rules:787`
- `firestore.rules:794`
- `firestore.rules:811`
- `firestore.rules:825`
- `firestore.rules:853`

Mesmo que a UI use soft delete, qualquer codigo autenticado com SDK, console do navegador, bug futuro ou componente novo pode chamar delete fisico e remover documentos sem lixeira.

Correcao recomendada:

- Trocar `allow delete` para `if false` nas colecoes operacionais.
- Manter exclusao apenas como update de `deletedAt`, `deletedBy`, `deletedReason`.
- Criar testes no emulador garantindo que `deleteDoc()` e negado para owner e admin.
- Remover o re-export de `deleteDoc` de `src/firebase.ts:84`, ja que ele nao deveria ser usado em fluxo comum.

Prioridade: maxima.

### Critico 2: Reset operacional apaga documentos fisicamente

A rota de reset usa `batch.delete` em colecoes operacionais:

- `server/dataResetRoutes.ts:22`
- `server/dataResetRoutes.ts:89`
- `server/dataResetRoutes.ts:103`
- `server/dataResetRoutes.ts:199`
- `server/dataResetRoutes.ts:200`

Ela exige admin, palavra `ZERAR` e `backupConfirmed`, o que ajuda:

- `server/dataResetRoutes.ts:187`
- `server/dataResetRoutes.ts:191`

Mas `backupConfirmed` e apenas uma declaracao enviada pelo frontend/API. O servidor nao comprova que um backup foi gerado, baixado, armazenado e restauravel.

Correcao recomendada:

- Substituir delete fisico por arquivamento com `resetId`, `deletedAt`, `deletedBy`.
- Antes de qualquer reset, gerar backup server-side em Cloud Storage/Firestore export e gravar hash/manifest.
- Criar uma janela de retencao, por exemplo 30 ou 90 dias, antes de purge definitivo.
- Implementar endpoint de restore por `resetId`.
- Adicionar modo "dry run" que mostra exatamente o que sera afetado.

Prioridade: maxima.

## Achados medios

### Medio 1: Escritas relacionadas nao sao atomicas em alguns fluxos

Salvar cliente + manutencao e registrar manutencao rapida usam operacoes separadas:

- `src/services/clientSaveService.ts:156`
- `src/services/clientSaveService.ts:163`
- `src/services/clientSaveService.ts:183`
- `src/services/clientSaveService.ts:209`
- `src/hooks/useMaintenanceActions.ts:76`
- `src/hooks/useMaintenanceActions.ts:93`

Se a primeira escrita passar e a segunda falhar, o sistema pode ficar inconsistente: cliente atualizado sem historico, historico criado sem atualizacao do cliente, ou pagamento divergente.

Correcao recomendada:

- Migrar pares cliente/manutencao para `writeBatch` ou transaction.
- Criar replay offline de batch para esses fluxos.
- Adicionar teste offline cobrindo falha parcial entre cliente e manutencao.

### Medio 2: Fila offline depende de `localStorage`

A fila customizada guarda o estado no `localStorage`:

- `src/services/firestoreOfflineQueue.ts:145`
- `src/services/firestoreOfflineQueue.ts:226`

Se o navegador limpar dados do site, se houver quota cheia ou se o usuario trocar de navegador antes da confirmacao remota, a fila de replay pode ser perdida. O Firestore tambem tem cache proprio, mas o painel/controle de retry depende desse estado local.

Correcao recomendada:

- Migrar a fila customizada para IndexedDB.
- Guardar checksum e versao do payload.
- Bloquear reset/logout critico quando houver `pendingWrites` ou `failedWrites`.
- Permitir exportar pendencias locais para arquivo de contingencia.

### Medio 3: Backup operacional nao cobre tudo e usa apenas dados ativos em memoria

O backup operacional JSON usa os arrays ativos do app:

- `src/components/layout/AppViewRenderer.tsx:672`
- `src/components/layout/AppViewRenderer.tsx:673`
- `src/components/layout/AppViewRenderer.tsx:681`

Esses arrays passam por filtros de soft delete em `useUserCollections`:

- `src/hooks/useUserCollections.ts:73`
- `src/hooks/useUserCollections.ts:109`
- `src/hooks/useUserCollections.ts:157`

Logo, o backup manual tende a nao incluir itens arquivados. Alem disso, ele nao inclui claramente `products`, `settings`, `fiscalCompanies` e `operationalLogs`.

Correcao recomendada:

- Criar backup completo server-side por usuario, incluindo ativos e arquivados.
- Incluir produtos, configuracoes, empresas fiscais e logs operacionais.
- Salvar manifest com contagem por colecao.
- Criar teste de restore do backup.

### Medio 4: Pre-carga offline busca colecoes inteiras sem paginacao

A pre-carga usa `getDocsFromServer` nas colecoes inteiras:

- `src/services/offlineDataPreload.ts:159`
- `src/services/offlineDataPreload.ts:161`

Para usuarios com muitos produtos, O.S. ou historico, isso pode ficar pesado, falhar parcialmente ou consumir muita memoria.

Correcao recomendada:

- Fazer pre-carga paginada.
- Persistir checkpoint por colecao.
- Priorizar dados essenciais primeiro: clientes, cash_launches recentes, manutencoes recentes, produtos ativos.
- Mostrar status visivel de pre-carga parcial.

### Medio 5: Erros de listeners ficam quase so no console

Os listeners principais registram erro no console, mas nem todos viram alerta claro para o usuario:

- `src/hooks/useUserCollections.ts:113`
- `src/hooks/useUserCollections.ts:121`
- `src/hooks/useUserCollections.ts:161`
- `src/hooks/useUserCollections.ts:225`

Isso pode levar o usuario a trabalhar olhando dados antigos sem perceber.

Correcao recomendada:

- Exibir banner "dados podem estar desatualizados" por colecao.
- Registrar falha em painel de sincronizacao.
- Diferenciar cache local, servidor atualizado e falha de permissao/rede.

## Achados baixos

### Baixo 1: `deleteDoc` e exportado apesar de nao ser usado nos fluxos atuais

O app exporta `deleteDoc` em:

- `src/firebase.ts:84`

Hoje nao ha uso direto encontrado, mas manter isso disponivel facilita introduzir delete fisico por engano.

Correcao recomendada:

- Remover `deleteDoc` do export publico.
- Se algum fluxo precisar apagar fisicamente, exigir funcao server-side com backup e auditoria.

### Baixo 2: Backup manual nao tem verificacao de integridade

Os backups gerados no navegador nao tem hash, assinatura, contagem esperada por colecao ou validacao de leitura apos gerar.

Correcao recomendada:

- Adicionar manifest com contagem e hash.
- Mostrar ao usuario "backup gerado com X registros".
- Adicionar import/restore de verificacao em ambiente de teste.

## Estado por area

| Area | Status | Observacao |
| --- | --- | --- |
| Offline/cache | Bom | Cache persistente e pre-carga existem, mas precisam paginacao para grandes volumes. |
| Escritas offline | Bom com ressalvas | Fila e retry existem; dependencia de localStorage ainda e fragil. |
| Exclusoes normais | Bom | Fluxos principais usam soft delete. |
| Exclusao fisica | Critico | Regras e reset operacional ainda permitem perda definitiva. |
| Backup manual | Medio | Ajuda, mas nao cobre tudo nem garante restauracao. |
| Backup automatico | Ausente na auditoria | Nao encontrei rotina server-side de export agendado/restauravel. |
| Regras de acesso | Bom | Testes passaram, mas `allow delete` precisa fechar para preservacao. |
| Consistencia cliente/historico | Medio | Algumas operacoes relacionadas nao sao atomicas. |

## Ordem recomendada de correcao

1. Fechar `allow delete` nas regras Firestore para colecoes operacionais.
2. Alterar reset operacional para arquivar e gerar backup server-side antes de qualquer remocao.
3. Criar backup automatico diario/semanal do Firestore com retencao e teste de restore.
4. Transformar fluxos cliente + manutencao em batch/transaction.
5. Migrar a fila offline customizada de `localStorage` para IndexedDB.
6. Expandir o backup operacional para incluir ativos, arquivados, produtos, settings, fiscalCompanies e operationalLogs.
7. Adicionar alertas visiveis para falha de listener/pre-carga parcial.
8. Remover `deleteDoc` do export publico do Firebase.

## Parecer final

O sistema esta em bom caminho e ja tem varias protecoes importantes contra perda acidental. Porem, para o objetivo declarado de ter certeza de que nenhum dado sera perdido, eu classifico o estado atual como:

**Aprovado com restricoes importantes.**

Restricao principal: enquanto existir delete fisico permitido nas regras e reset operacional com `batch.delete`, ainda existe risco real de perda irreversivel.

Depois de corrigir os dois achados criticos e adicionar backup server-side com restore testado, o sistema fica muito mais perto de um padrao confiavel de preservacao de dados.
