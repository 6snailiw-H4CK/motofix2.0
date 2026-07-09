# Correcoes recomendadas — status de implementacao

1. [x] Corrigir confirmacao falsa (CRITICO)

- A fila nao usa mais `confirmed` para a conclusao rapida da Promise; o estado agora e `settled` ou `queued`.
- A confirmacao remota usa checkpoint + `waitForPendingWrites`, com limite de espera e retorno explicito `remoteConfirmed`.
- `warrantyRepository.create` e a geracao automatica do PDF dependem exclusivamente dessa confirmacao remota.

2. [x] Implementar retry / armazenar payloads minimos

- Escritas idempotentes persistem um descritor minimo (`set`/`update`, caminho e dados necessarios).
- `retryFailedWrite(writeId)` reexecuta e aguarda confirmacao remota sem callback especifico de UI.
- Operacoes em lote ou com transformacoes nao serializaveis ficam identificadas como correcao manual.

3. [x] Sincronizacao multi-aba

- O listener de `storage` recarrega `QUEUE_STORAGE_KEY` e emite o novo estado da fila.

4. [x] Soft-delete / backup obrigatorio

- Clientes, historicos, garantias, agendamentos, despesas, mercadorias, O.S. e logs usam `deletedAt`, `deletedBy` e `deletedReason`.
- As colecoes ativas filtram itens arquivados; repositorios oferecem restauracao e as acoes comuns exibem `Desfazer`.
- A zeragem administrativa, que permanece destrutiva, exige perfil admin, confirmacao `ZERAR` e backup operacional JSON.

5. [x] Reduzir dependencia da persistencia da fila

- As mutacoes pendentes continuam protegidas pelo cache persistente multi-aba do proprio Firestore (IndexedDB); o `localStorage` guarda metadados e descritores de recuperacao.
- Falhas ao persistir metadados permanecem em memoria, sao contabilizadas, registradas e notificadas ao usuario.

6. [~] Telemetria/alertas

- Implementados eventos de telemetria para falha, retry e persistencia, alem de contadores no painel operacional.
- Pendente apenas conectar esses eventos a um provedor externo de observabilidade, se desejado.

7. [x] Revisao UX

- O PDF de garantia nao e gerado quando a confirmacao remota esta pendente ou expirou.
- O painel de falhas informa quando ha retry seguro, falta de conexao ou necessidade de correcao manual.
