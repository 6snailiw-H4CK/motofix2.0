# Sincronização incremental do Firestore

## Comportamento

- Cada conjunto de dados ativo da tela continua usando a primeira leitura completa como base local.
- Depois da base inicial, as verificações automáticas de quatro em quatro horas e o botão de sincronização consultam apenas documentos com `updatedAt` recente nas coleções operacionais principais.
- O intervalo de sobreposição de dois minutos reduz o risco de perder gravações por diferença no relógio do dispositivo ou por gravações concluídas durante a consulta.
- A consulta incremental atualiza o cache persistente do Firestore; a aplicação relê esse cache localmente para manter na tela os documentos que não mudaram.
- Exclusões e restaurações usam exclusão lógica e atualizam `updatedAt`, então também chegam pela consulta incremental.
- Uma reconciliação completa acontece a cada 30 dias para corrigir alterações feitas por versões antigas do app e exclusões manuais no console do Firebase. Ela também ocorre quando o cache local desaparece ou a contagem de documentos mostra que ele foi removido parcialmente.
- `settings`, logs operacionais limitados aos 50 mais recentes e coleções fiscais continuam usando sua leitura completa limitada pelo comportamento atual; essas coleções não fazem parte do grupo incremental nesta etapa.

## Registros anteriores

Os registros existentes sem `updatedAt` aparecem na leitura inicial completa. O script de backfill prepara esses documentos para futuras consultas incrementais. Ele só faz simulação por padrão e requer um UID específico; nenhuma alteração em produção deve ser feita sem executar explicitamente `--apply`.

```powershell
node scripts/backfill-firestore-sync-metadata.mjs --uid=UID_DO_USUARIO
node scripts/backfill-firestore-sync-metadata.mjs --uid=UID_DO_USUARIO --apply
```

O script usa `FIREBASE_SERVICE_ACCOUNT_PATH` se definido; caso contrário, procura `firebase-service-account.json` na raiz do projeto. Não inclua nem publique a chave de serviço.

## Publicação

1. Revise o resultado da simulação por UID.
2. Publique as Firestore Rules que aceitam e validam `updatedAt` nas coleções incrementais.
3. Publique a versão do app com a consulta incremental.
4. Rode o backfill por UID com `--apply` para preparar registros antigos sem `updatedAt`.
5. Não rode o backfill sem `--apply` e sem escolher explicitamente o UID. O backfill não foi executado nesta implementação.

As leituras de inicialização continuam completas por usuário e coleção necessária; a redução acontece nas sincronizações seguintes. O cliente mantém os dados isolados por `users/{uid}/{collection}`.
