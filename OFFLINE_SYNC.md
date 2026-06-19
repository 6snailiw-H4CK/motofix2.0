# MotoFix - Operacao Offline e Sincronizacao

## Backup antes das alteracoes

Backup criado antes de qualquer alteracao de codigo:

- `backups/pre-offline-sync-20260618-071957/motofix2.0-pre-offline-sync-20260618-071957.zip`
- Manifesto do backup: `backups/pre-offline-sync-20260618-071957/manifest-20260618-071957.txt`

O backup inclui codigo, configuracoes, documentos e arquivos locais do projeto. Foram excluidos apenas diretorios gerados ou pesados (`node_modules`, `dist`, `build`, `.next`, `.vite`, `coverage`, `backups`).

## Objetivo

Permitir que a aplicacao continue operando durante um periodo sem internet, salvando entradas do usuario localmente e enviando automaticamente ao Firestore quando a conexao voltar.

Exemplo coberto:

1. O usuario abre o MotoFix em um computador que ja usou a aplicacao antes.
2. A internet cai durante o expediente.
3. Cadastros, edicoes e exclusoes seguem funcionando pela tela.
4. As alteracoes ficam na fila local do Firestore/IndexedDB.
5. Ao conectar a internet novamente, o Firebase sincroniza as pendencias com o banco.

## Como funciona agora

### 1. Cache persistente do Firestore

Arquivo: `src/firebase.ts`

- O Firestore passou a iniciar com `initializeFirestore`.
- Foi ativado `persistentLocalCache` com IndexedDB.
- Foi ativado `persistentMultipleTabManager`, permitindo sincronizacao entre abas.
- O cache usa `CACHE_SIZE_UNLIMITED` para reduzir o risco de descarte de dados locais importantes.
- Se o cache persistente nao estiver disponivel no navegador, a aplicacao cai para o cache em memoria e registra aviso no console.

### 2. Escritas offline nao travam a interface

Arquivo novo: `src/services/firestoreOfflineQueue.ts`

- Toda gravacao principal passa por `queueFirestoreVoidWrite`.
- O helper inicia a escrita no SDK do Firestore.
- Se a confirmacao do servidor demorar mais de 1,2 segundo, a tela segue em frente considerando a escrita como enfileirada.
- Quando o Firebase confirmar a escrita, a pendencia sai do contador.
- Se o servidor rejeitar depois (por regra de seguranca, permissao ou dado invalido), o erro fica registrado no estado de sincronizacao.

### 3. IDs locais para novos documentos

Arquivos alterados:

- `src/services/clientRepository.ts`
- `src/services/maintenanceRepository.ts`
- `src/services/appointmentRepository.ts`
- `src/services/cashRegisterRepository.ts`
- `src/services/expenseRepository.ts`
- `src/services/warrantyRepository.ts`
- `src/services/alertService.ts`

Antes, muitos cadastros usavam `addDoc`, que so devolve o ID depois da escrita. Agora o ID e criado localmente com `doc(collection)` e a escrita e feita com `setDoc`. Isso permite que o fluxo continue offline.

### 4. Lotes e atualizacoes tambem entram na fila

Arquivos alterados:

- `src/services/productRepository.ts`
- `src/services/settingsRepository.ts`
- `src/services/userRepository.ts`
- `src/services/messageLogRepository.ts`
- `src/hooks/useUserCollections.ts`

Importacoes de mercadorias, ajustes, perfil de usuario, logs e exclusoes tambem usam a fila offline.

### 5. Login e perfil com fallback offline

Arquivo: `src/hooks/useAuthProfile.ts`

- O token de autenticacao tenta atualizar quando ha conexao.
- Se a atualizacao falhar ou demorar, usa o token local salvo.
- O perfil do usuario tenta leitura normal e cai para `getDocFromCache` quando esta offline ou quando a rede demora.
- O papel `admin` salvo no perfil nao e rebaixado automaticamente quando a claim nao puder ser renovada offline.

Importante: o primeiro login ainda precisa de internet. Depois que usuario, perfil e colecoes ja foram carregados nesse navegador, o uso offline fica disponivel.

### 6. App abre offline depois de ter sido carregado uma vez

Arquivo: `public/sw.js`

- O service worker passou a cachear a casca da aplicacao (`/`, `index.html`, `manifest.json`, logo).
- Navegacao usa estrategia network-first com fallback para `index.html` em cache.
- Assets locais usam cache-first com atualizacao em segundo plano.
- O comportamento de notificacoes push foi mantido.

Arquivo: `public/manifest.json`

- Os icones deixaram de depender de CDN externa e passaram a usar `/motofix-logo.svg`.

### 7. Indicador visual de sincronizacao

Arquivos novos/alterados:

- `src/hooks/useOfflineSyncStatus.ts`
- `src/components/layout/OfflineSyncPill.tsx`
- `src/components/layout/AppShell.tsx`
- `src/components/layout/AppHeader.tsx`
- `src/components/layout/TopBar.tsx`
- `src/App.tsx`

O topo da aplicacao mostra um badge apenas quando necessario:

- `Offline`: sem conexao.
- `N pendente(s)`: existem gravacoes locais aguardando envio.
- `Sincronizando`: o Firestore esta aguardando `waitForPendingWrites`.
- `Erro sync`: uma escrita foi rejeitada pelo servidor depois de enfileirada.

## Limitacoes importantes

- O primeiro login precisa de internet, pois Firebase Auth precisa autenticar o usuario.
- Para abrir a aplicacao totalmente offline, o navegador precisa ter carregado o app pelo menos uma vez com internet para instalar o service worker e preencher cache.
- Recursos que dependem de servicos externos em tempo real continuam precisando de internet, como WhatsApp, Stripe, emissao fiscal e qualquer API externa.
- Se duas maquinas editarem o mesmo documento offline, o Firestore resolve pelo ultimo write aceito pelo servidor. Regras de negocio de conflito podem ser adicionadas depois se necessario.
- Se o navegador bloquear IndexedDB ou limpar dados do site, as pendencias locais podem ser perdidas. Recomenda-se nao limpar dados do navegador antes de reconectar e sincronizar.

## Validacao executada

- `npm run lint` passou com sucesso (`tsc --noEmit`).
- `npm run build` passou com sucesso (frontend Vite + bundle do servidor).
- Servidor local de producao respondeu `200 OK` em:
  - `/`
  - `/sw.js`
  - `/manifest.json`
  - `/motofix-logo.svg`

## Como testar manualmente

1. Abra a aplicacao com internet e faca login.
2. Navegue pelos modulos principais para preencher o cache inicial.
3. Desconecte a internet do computador.
4. Crie um cliente, um servico, um gasto ou um agendamento.
5. Confira que a tela nao fica presa em "salvando" e que aparece o status offline/pendente.
6. Reconecte a internet.
7. Aguarde o badge sumir.
8. Confira no Firebase/Firestore se os documentos foram enviados.

## Fase 2 - reforco para o piloto de 60 dias

Status em andamento em 19/06/2026.

### Concluido no codigo

- Backup emergencial CSV para clientes, motos, ordens de servico e garantias.
- Painel interno de saude da sincronizacao com status, ultima sincronizacao, pendencias, falhas e quantidade de drafts locais.
- Base de log operacional em `users/{userId}/operational_logs`.
- Registro de log para cliente criado/editado/removido, O.S. criada, garantia criada, despesa criada e receita criada.
- Regra Firestore append-only para `operational_logs`: usuario ativo pode criar, dono/admin pode ler e ninguem pode editar ou excluir pelo cliente.
- Servico central de drafts locais em `src/services/localDrafts.ts`.
- Autosave e restauracao de draft em despesas e agendamentos.
- Autosave e restauracao de draft no formulario de garantia, com limpeza somente apos salvamento bem-sucedido.
- Autosave e restauracao de draft no cadastro de cliente/servico.
- Autosave e restauracao completa do Lancamento Caixa.
- Metadados da fila offline persistidos em `localStorage`, mantendo contagem de pendencias apos fechar e reabrir o navegador.
- Checkpoint da fila conciliado com `waitForPendingWrites` depois da reconexao.
- Contador persistente de falhas de sincronizacao no painel interno.
- Feedback operacional especifico para gravacoes offline em clientes, O.S., garantias, despesas e agendamentos.
- Parser monetario BR centralizado e aplicado aos fluxos operacionais corrigidos.

### Em implementacao

- Validacao manual autenticada em navegador com uma conta piloto.

### Validacao tecnica parcial

- `npm run lint` passou apos a integracao dos backups, logs, painel, drafts e fila persistente.

### Relatorio tecnico dos testes de desastre

Comando repetivel: `npm run test:offline`.

Cenarios automatizados executados:

1. Salvar draft de O.S. offline.
2. Simular fechamento/reabertura mantendo o mesmo armazenamento local e restaurar o draft.
3. Criar multiplos drafts locais simultaneamente.
4. Manter uma escrita offline pendente depois do timeout da interface.
5. Reconectar e confirmar o checkpoint de escritas pendentes.
6. Criar tres registros offline e sincronizar posteriormente.
7. Simular rejeicao `permission-denied` durante a sincronizacao e manter contador/mensagem de falha.

Resultado final: 7 cenarios aprovados.

Falha encontrada durante os testes:

- O contador de drafts usava `Object.keys(localStorage)`, que nao e a forma mais portavel de enumerar o Storage.

Correcao aplicada:

- A enumeracao passou a usar a API padrao `localStorage.length` e `localStorage.key(index)`.
- O teste foi repetido desde o inicio e os 7 cenarios passaram.

Validacoes adicionais:

- `npm run lint` passou.
- `npm run build` passou para frontend e servidor.
- `http://localhost:3001` respondeu `200`.
- `http://localhost:3001/src/main.tsx` respondeu `200`.

Riscos remanescentes:

- O fluxo autenticado completo ainda precisa ser repetido manualmente com uma conta piloto real; nao havia credenciais de teste disponiveis nesta execucao.
- O navegador integrado nao estava disponivel para validacao visual autenticada nesta sessao.
- Limpar dados do site apaga drafts em `localStorage` e pode apagar o cache/pendencias do Firestore em IndexedDB.
- Uma rejeicao por regras/permissao continua impedindo o envio ao servidor; agora ela fica visivel no painel e no contador de falhas.
- O primeiro login e o carregamento inicial do cache continuam exigindo internet.
- A alteracao de `firestore.rules` precisa ser publicada junto com a Fase 2 para habilitar os logs operacionais em producao.
