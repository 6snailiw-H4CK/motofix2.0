# Auditoria completa do MotoFix 2.0

**Data:** 16/09/2026  
**Escopo:** revisão estática do repositório, configuração, arquitetura, módulos, rotas, persistência, controles de acesso, integrações e testes locais.  
**Fora do escopo:** dados reais do Firestore, credenciais, infraestrutura efetivamente publicada, disponibilidade de provedores externos e teste manual de interface. Nenhum dado de produção foi lido, criado, alterado ou removido.

## Resumo executivo

O MotoFix é uma SPA React com Firebase Auth/Firestore, uma API Express para operações privilegiadas e integrações com Stripe, Focus NFe e WhatsApp. A base operacional é ampla: clientes, serviços, agenda, retornos, caixa, estoque, despesas, garantias, relatórios, backup e administração. O build e as verificações locais principais estão saudáveis.

Há, porém, riscos que impedem classificar a aplicação como pronta para produção sem correções e nova validação:

1. **Crítico — bloqueio de conta/assinatura não é imposto pelo Firestore.** A função de regras `isActiveOwner` verifica apenas identidade autenticada; uma conta inativa ou sem assinatura ainda pode gravar diretamente nas próprias coleções usando o SDK/API Firebase, contornando o bloqueio visual da SPA.
2. **Crítico — custom claims podem manter privilégios antigos.** A Cloud Function preserva claims existentes ao montar o novo conjunto. Assim, rebaixar/desativar um usuário no documento não remove `admin` ou `isActive` já presentes no token.
3. **Alto — publicação não entrega a API nem as Functions.** `npm run deploy:prod` publica somente Hosting e regras. O servidor Express e `functions/` exigem implantação e configuração próprias; sem isso, cobrança, backup, reset e fiscal não funcionam pelo Hosting.
4. **Alto — WhatsApp está explicitamente desligado em produção.** Rotas e scheduler só são registrados quando `NODE_ENV !== production`; o recurso não é operacional na publicação padrão atual.
5. **Alto — regras e estoque não foram validados no emulador nesta máquina.** A Firebase CLI não está instalada. Além disso, o script `test:rules:scenarios` apenas imprime cenários, não executa regras reais.

### Estado por área

| Área | Situação | Observação |
|---|---|---|
| Compilação TypeScript | Aprovada | `npm run lint` passou. |
| Build web + servidor | Aprovado | `npm run build` passou. |
| Dados operacionais | Funcional, com risco de autorização | Firestore multi-tenant e soft delete; bloqueio de assinante é só de UI. |
| Estoque | Boa base transacional | Requer emulador e fluxo visual para homologação final. |
| Cobrança Stripe | Boa cobertura unitária | 31 testes passaram; ainda falta homologação webhook/Checkout real. |
| Backup/restauração | Implementado, com risco operacional | Há backup completo e restore por merge; destino automático precisa ser persistente e protegido. |
| WhatsApp | Não pronto para produção | API/scheduler não são registrados em produção. |
| Fiscal | Beta restrito | Protegido no cliente por flag/e-mail; depende de API externa configurada. |
| E2E/UI | Não coberto | Não há Playwright, Cypress ou testes de componentes. |

---

## 1. Método e evidências

Foram revisados `src/`, `server/`, `functions/`, `scripts/`, `firestore.rules`, `firebase.json`, `.firebaserc`, configurações de build e exemplos de ambiente. A árvore de trabalho estava modificada antes da auditoria em arquivos de documentação/regras e continha o arquivo não rastreado `firebase-auth-admin-diagnostic.json`; esses itens não foram sobrescritos.

### Comandos executados

| Comando | Resultado |
|---|---|
| `npm run lint` | Passou (`tsc --noEmit`). |
| `npm run build` | Passou: Vite gerou o cliente e esbuild gerou `dist-server/server.js`. |
| `npm run test:offline` | Passou: 11 cenários. |
| `npm run test:rules:static` | Passou: 7 verificações textuais. |
| `npm run test:backup` | Passou: 2 testes. |
| `npm run test:stripe` | Passou: 31 testes. |
| `npm run test:rules` | Não executado: Firebase CLI ausente (`firebase` não é reconhecido). |

Não foi executado `test:fiscal`, pois pode acionar configuração/provedor fiscal, nem `test:stock`, pois depende do mesmo emulador indisponível.

---

## 2. Arquitetura e fluxo do sistema

```text
Navegador / PWA
  React 19 + Vite + Tailwind + Firebase Web SDK
  ├─ Google Auth e cache persistente
  ├─ Firestore (dados por /users/{uid}/...)
  ├─ fila offline, rascunhos e service worker
  └─ chamadas autenticadas Bearer para API externa
                 |
                 v
Servidor Express (porta 3001 em desenvolvimento)
  ├─ Stripe: Checkout, portal, cancelamento e webhook
  ├─ Fiscal: empresas, certificado, NFS-e e documentos
  ├─ Backup, restore e zeragem operacional
  ├─ WhatsApp e scheduler (somente fora de produção hoje)
  └─ Firebase Admin / Firestore Admin
                 |
                 v
Firebase
  ├─ Authentication (Google)
  ├─ Firestore + regras
  ├─ Hosting (somente SPA configurada)
  └─ Cloud Function legada para sincronizar custom claims
```

### Tecnologias identificadas

| Camada | Implementação |
|---|---|
| Frontend | React 19, TypeScript, Vite 6, Tailwind 4, Lucide, Recharts, Sonner. |
| Dados | Firebase Auth, Firestore, cache persistente IndexedDB e multi-aba. |
| API | Express, Firebase Admin e rate limit em memória. |
| Pagamentos | Stripe SDK/Stripe.js. |
| Fiscal | Focus NFe, em modo beta com NFS-e. |
| Documentos | jsPDF, html2canvas, QRCode. |
| Offline | Service Worker próprio, manifesto de assets e fila de replay. |
| Funções Firebase | `firebase-functions` v4 / Node 18 em `functions/`. |

### Rotas de navegador

Não há React Router nem URLs funcionais por módulo. `AppView` controla a tela em memória no `App.tsx`/`AppViewRenderer.tsx`; a navegação não cria deep links. Ao recarregar, o estado volta a `dashboard`.

Consequências:

- links diretos para Agenda, Caixa ou Garantias não existem;
- histórico/voltar do navegador não representa a navegação interna;
- é simples de manter, mas limita compartilhamento de telas e observabilidade por URL.

---

## 3. Módulos funcionais

| Módulo/tela | Função | Principais dados |
|---|---|---|
| Início | indicadores, prioridades, agenda e ações rápidas | clientes, O.S., agenda, garantias, despesas. |
| Serviços/Óleo | registra serviços recorrentes, busca e pagamento | `clients`, `maintenances`. |
| Clientes | ficha de cliente/moto, cadastro, edição e histórico | `clients`, `maintenances`. |
| Agenda | cria, conclui e arquiva agendamentos | `appointments`. |
| Retornos | fila de recorrência, aviso e registro de retorno | `clients`, `maintenances`, `message_logs`. Inclui busca por nome e filtro `dd/mm/aaaa` adicionado nesta sessão. |
| Pendências | saldos em aberto e baixa de pagamento | `maintenances`, `cash_launches`. |
| Caixa / O.S. | lançamento, pagamento, itens, impressão e baixa/estorno de estoque | `cash_launches`, `products`, `stock_movements`. |
| Mercadorias | catálogo, importação/exportação e estoque mínimo | `products`. |
| Gastos | cadastro, fornecedor, período e gráficos | `expenses`. |
| Garantias | criação, edição, certificado PDF e vencimentos | `warranties`. |
| Histórico/relatórios | serviços, mensagens, pagamentos e relatórios mensais | `maintenances`, `cash_launches`, `message_logs`. |
| Saúde financeira | metas, tendências, ranking e indicadores | dados financeiros agregados; restrito ao admin na renderização. |
| Configurações | perfil, tipos de serviço, categorias, exports, backup/restore e reset | `settings`, backups e logs. |
| Administração | usuários, acesso, assinatura, relatórios | coleção raiz `users`; visível ao papel admin na UI. |
| Checkout | início de checkout Stripe | API Stripe. |
| Fiscal | empresa, certificado, NFS-e, XML/PDF e logs | API fiscal e coleções fiscais; flag beta. |
| WhatsApp | cliente de API, QR, mensagens e automações existe no código | não há renderização/navegação ativa para `whatsapp` em `AppViewRenderer`; API também fica fora de produção. |

### Fluxos de negócio relevantes

**Cliente e serviço:** formulário cria/atualiza cliente e manutenção em `writeBatch`, com descriptor para replay offline. A remoção é lógica; cliente e histórico podem ser arquivados juntos, com limite seguro de lote.

**Caixa e estoque:** uma O.S. finalizada com itens controlados exige conexão e executa `runTransaction`. A transação atualiza produto, cria movimentos e marca a O.S. como baixada; reabrir/cancelar/restaurar estorna estoque. É uma boa escolha para consistência concorrente.

**Offline:** Firestore usa cache persistente, rascunhos são guardados localmente e a fila customizada tenta reexecutar mutações. Operações transacionais de estoque são deliberadamente bloqueadas offline.

**Exclusão:** deletes físicos são vedados nas regras. A aplicação usa campos de soft delete e filtra registros arquivados no listener.

**Assinatura:** o cliente bloqueia visualmente usuário sem assinatura ativa e Stripe atualiza `billing` no documento via servidor. Isso não substitui autorização no banco (ver achado A-01).

---

## 4. Modelo de dados e Firestore

O particionamento principal é `/users/{userId}`. Cada usuário possui subcoleções próprias.

| Coleção | Finalidade |
|---|---|
| `users` | perfil, estado de atividade, assinatura e billing. |
| `clients` | cliente, moto, recorrência, serviço recente e automação. |
| `maintenances` | histórico de serviços, valores e pagamentos. |
| `appointments` | agendamentos. |
| `warranties` | garantias e vencimentos. |
| `expenses` | despesas. |
| `products` | mercadorias e saldo de estoque. |
| `stock_movements` | movimentos imutáveis de estoque. |
| `cash_launches` | O.S./vendas, pagamentos, fiscal e estado de estoque. |
| `settings/config` | configurações e perfil da oficina. |
| `message_logs` | logs de comunicação. |
| `operational_logs` | auditoria operacional resumida. |
| `fiscal_*` | empresa, notas, logs e arquivos; dados privados ficam no servidor. |
| `whatsapp_*` | sessão, mensagens, contatos e automações administrados no servidor. |
| `billing_events` e `stripe_events` | idempotência/eventos Stripe, escritos pelo servidor. |

### Pontos positivos

- Isolamento por UID e campo `userId` validado nas coleções principais.
- Schemas com limites de tamanho/valor nas regras.
- Soft delete e fallback deny-by-default para subcoleções desconhecidas.
- `fiscal_private` e arquivos fiscais não são acessíveis pelo navegador.
- Estoque usa transação e movimentos separados.

### Limitações observadas

- Datas são `string` nas regras; não há validação de formato ISO/semântica.
- `firestore.indexes.json` não declara índices compostos; hoje os listeners carregam coleções inteiras e filtram no cliente.
- Vários listeners em tempo real são abertos simultaneamente para cada usuário, o que aumenta custo/leitura e pode pressionar quotas com bases grandes.
- `operational_logs` permite criação por qualquer dono sem validação de schema devido ao trecho `isAdmin() || isOwner(userId) || ...`; portanto ele é útil para rastreio operacional, mas não é trilha de auditoria inviolável.

---

## 5. Autenticação, autorização e segurança

### Controles existentes

- Login Google com persistência local de sessão.
- Token Firebase Bearer validado por Firebase Admin nas rotas sensíveis.
- Admin definido por custom claim `admin`, não pelo campo `role` do documento.
- CORS por lista de origens configuráveis; localhost aceito somente fora de produção.
- Cabeçalhos `nosniff`, `DENY` para frame, política de referrer e permissões de câmera/microfone/geolocalização bloqueadas.
- Limitação de taxa em memória por IP e rota, com limites reforçados para fiscal, Stripe, reset e backup.
- Webhook Stripe recebe corpo raw antes do parser JSON.

### A-01 — Crítico: usuário inativo/sem assinatura pode gravar diretamente no Firestore

**Evidência:** `firestore.rules` define:

```rules
function isActiveOwner(userId) {
  return isOwner(userId) && signedIn();
}
```

`validOwnerCreate`, `validOwnerUpdate` e vários caminhos de caixa dependem dessa função. Ela não consulta claim `isActive`, perfil, assinatura nem data de vencimento. O bloqueio de assinatura do `App.tsx` impede a navegação visual, mas as regras são a fronteira de segurança para clientes que usam diretamente o SDK.

**Impacto:** uma pessoa autenticada, mesmo com perfil inativo/assinatura expirada, pode criar ou alterar registros próprios que atendam ao schema.

**Correção prioritária:** definir um único critério de acesso operacional no token, por exemplo `request.auth.token.isActive == true`, e exigir esse critério em todas as escritas. A emissão/revogação do claim deve ser feita apenas por servidor confiável. Se acesso depender de validade de assinatura, sincronizar/revogar claims no webhook e forçar refresh/revogação de tokens conforme a política de negócio.

### A-02 — Crítico: sincronização de custom claims não remove privilégios revogados

**Evidência:** `functions/index.js` monta o próximo conjunto assim:

```js
const desiredClaims = {};
if (after.role === 'admin') desiredClaims.admin = true;
if (after.isActive === true) desiredClaims.isActive = true;
const merged = { ...existing, ...desiredClaims };
```

Quando `role` deixa de ser `admin` ou `isActive` passa para `false`, `desiredClaims` não contém a chave, mas `existing` a mantém. O comentário afirma preservar claims não relacionados, porém preserva também os dois claims que deveriam ser controlados por esta função.

**Impacto:** desativar/rebaixar alguém no documento pode não retirar privilégios no token; combinado com A-01, a revogação de acesso é especialmente frágil.

**Correção prioritária:** copiar apenas claims não gerenciadas e remover explicitamente `admin` e `isActive` antes de aplicar o estado desejado. Em seguida, revogar refresh tokens do usuário afetado. Criar teste de promoção, rebaixamento, ativação e desativação.

### A-03 — Médio: proteção de conteúdo no navegador pode ser fortalecida

Não há Content-Security-Policy no middleware. React escapa texto por padrão, mas o sistema gera impressões/PDF e lida com dados fornecidos por usuários. Adicionar CSP compatível, revisar todo HTML interpolado e manter sanitização explícita onde houver inserção em HTML são medidas preventivas recomendadas.

### A-04 — Médio: rate limit é local ao processo

Os buckets estão em `Map` na memória. Em múltiplas réplicas, reinício ou ambiente serverless, o limite não é global. Para ações caras (backup, reset, emissão fiscal, login/checkout), usar Redis/serviço gerenciado ou uma barreira transacional complementar.

---

## 6. API Express

### Rotas identificadas

| Método | Endpoint | Autenticação | Finalidade |
|---|---|---|---|
| GET | `/api/health` | Não | healthcheck. |
| GET/POST | `/api/backup/full`, `/api/backup/full/restore` | Firebase token | exportação e restore por merge. |
| POST | `/api/data-reset/operational` | Admin custom claim | arquiva dados operacionais e limpa campos de clientes. |
| POST/GET | `/api/stripe/create-checkout-session`, `/subscription`, `/cancel-subscription`, `/create-customer-portal-session` | Firebase token | cobrança e portal. |
| POST | `/api/stripe/webhook` | Assinatura Stripe | atualiza billing/eventos. |
| GET/POST | `/api/fiscal/health`, `/companies`, certificado, NFS-e manual/caixa, sync, cancelamento, documentos | token salvo health | fiscal/Focus NFe. |
| GET/POST/PUT | `/api/whatsapp/*` | token, exceto health | sessão, QR, envio, mensagens, contatos e automações. |

### A-05 — Alto: estratégia de deploy da API está incompleta

`firebase.json` configura Hosting como SPA e redireciona `**` para `index.html`. Os scripts `deploy:hosting` e `deploy:prod` fazem deploy apenas de **hosting** e/ou **regras**, sem `functions` e sem o Express. Não há workflow CI/CD, Cloud Run manifest, serviço Railway/Render ou rewrite de Hosting para a API.

O frontend usa variáveis como `VITE_STRIPE_API_URL`, `VITE_FISCAL_API_URL`, `VITE_BACKUP_API_URL` e `VITE_WHATSAPP_API_URL`. Se não forem configuradas para um backend publicado, chamadas relativas a `/api/...` atingirão o fallback da SPA e poderão devolver HTML em vez de JSON.

**Ação:** documentar e automatizar um único modelo de produção. Exemplo: publicar o Express no Cloud Run com variáveis/secret manager e configurar as URLs `VITE_*`; ou criar rewrites explícitos do Firebase Hosting para o serviço. Incluir smoke test pós-deploy para `/api/health`, Stripe, backup e fiscal.

### A-06 — Alto: WhatsApp está desativado no servidor de produção

Em `server.ts`, tanto `registerWhatsAppRoutes` quanto `startWhatsAppScheduler` só rodam dentro de `if (!isProduction)`. Portanto, em `NODE_ENV=production` as rotas não existem e lembretes automáticos não são executados. A própria tela WhatsApp não está conectada no roteador de views atual.

**Ação:** escolher explicitamente entre remover/ocultar o recurso até ser suportado ou implantar um worker dedicado e seguro para WhatsApp. Nunca habilitar uma sessão de navegador/WhatsApp em réplicas efêmeras sem armazenamento persistente e política operacional.

### A-07 — Médio: backup automático depende de disco local

O scheduler inicia ao subir o Express e salva backup de **todos os usuários** em `backups/automatic` ou `BACKUP_SNAPSHOT_DIR`, retendo 30 por padrão. Em ambiente efêmero, discos podem ser descartados; em ambiente persistente, esses JSONs contêm PII e dados operacionais e precisam de criptografia, controle de acesso, backup externo, retenção e monitoramento.

**Ação:** direcionar para armazenamento persistente/criptografado com menor privilégio, configurar retenção e alertas de falha, e testar recuperação completa regularmente. Não registrar conteúdo do backup em logs.

### A-08 — Médio: restore é merge administrativo do próprio usuário, sem validação completa de schema

O endpoint exige token e a confirmação literal `RESTAURAR`, força `userId` nas coleções pertinentes e não restaura `fiscal_private`; são boas salvaguardas. Contudo, usa Admin SDK e aceita documentos do formato de backup sem validar cada schema de negócio, e o modo é `safe-merge` (não remove documentos extras existentes). Isso deve ser explicitado na interface e coberto por testes de backup malformado, colisões e rollback.

---

## 7. Integrações externas

| Integração | Estado atual | Riscos / exigências |
|---|---|---|
| Firebase Auth/Firestore | Central e funcional em código | revisar claims, regras reais no emulador e índices/custos. |
| Stripe | checkout, portal, webhook e idempotência implementados | requer URLs, preços, webhook secret e teste em sandbox/produção. |
| Focus NFe | NFS-e, certificado e documentos disponíveis no backend | beta por flag/e-mail; requer credenciais, homologação e política de certificados. |
| WhatsApp/Open-WA | serviço e API presentes | desligado em produção e requer processo persistente/Chrome/sessão. |
| IA para WhatsApp | endpoint OpenAI configurável | só deve operar com chave no servidor, limites de entrada/saída e política de dados. |

O arquivo `.env.example` é útil e não contém segredo real. Ele deve ser mantido como única referência pública; nunca versionar `.env`, contas de serviço, sessões WhatsApp, backups ou certificados.

---

## 8. Offline, disponibilidade e integridade

### Implementado

- cache persistente do Firestore com `persistentLocalCache` e gerenciador de múltiplas abas;
- service worker com precache do manifesto de build e estratégia network-first/cache-first;
- rascunhos locais de formulários;
- fila/replay de escritas Firestore e indicador visual de sincronização;
- operação de estoque protegida por transação e bloqueada offline;
- soft delete e mecanismos de restauração para diversos registros.

### Riscos e recomendações

1. A fila offline é complexa e precisa de testes E2E em modo avião, conflito entre duas abas e interrupção durante replay.
2. Cache offline não substitui backup: limpeza de dados do navegador remove rascunhos e estado local.
3. O service worker deve ser validado após cada release, principalmente atualização de assets e fallback de navegação.
4. A leitura simultânea de muitas coleções em `useUserCollections` pode consumir quota; medir com uma conta grande e considerar paginação/consultas por período/status.

---

## 9. Testes e qualidade

### Cobertura existente confirmada

| Conjunto | Resultado | O que cobre |
|---|---|---|
| Lint | Passou | tipos TypeScript. |
| Offline | 11/11 | rascunhos, fila/replay e falhas controladas. |
| Regras estáticas | 7/7 | presença textual de proteções selecionadas. |
| Backup | 2/2 | retenção de arquivos automáticos. |
| Stripe | 31/31 | ordenação de eventos, acesso, checkout, cancelamento e CORS. |
| Build | Passou | bundle cliente e servidor. |

### Lacunas importantes

- Não há testes de componentes React nem E2E (Playwright/Cypress).
- `test:rules:scenarios` é narrativo: ele escreve cenários no console e termina com sucesso, sem avaliar Firestore Rules.
- O teste de regras real e o teste de estoque dependem do Firebase Emulator, indisponível localmente sem Firebase CLI.
- Não há teste automatizado do ciclo completo de custom claims, bloqueio de usuário e renovação/revogação de token.
- Não há teste de restore completo, arquivos malformados, rollback, conflito de IDs ou recuperação em desastre.
- Fiscal e WhatsApp não têm homologação automatizada no escopo atual.
- Não há pipeline CI/CD visível no repositório.

---

## 10. Configuração e publicação

### Arquivos principais

| Arquivo | Papel |
|---|---|
| `package.json` | scripts de desenvolvimento, build, testes e deploy. |
| `vite.config.ts` | Vite, chunks manuais e manifesto offline. |
| `firebase.json` | Firestore rules e Hosting SPA. |
| `.firebaserc` | projeto Firebase `appmotofix`. |
| `server.ts` | bootstrap Express e middleware de segurança. |
| `Dockerfile.fiscal` | imagem genérica do servidor em Node 24; apesar do nome, empacota o app completo. |
| `.env.example` | contrato de variáveis de ambiente. |

### A-09 — Médio: Functions legadas não fazem parte do deploy padrão

Existe uma Function de sincronização de claims em `functions/index.js`, com Node 18 e dependências próprias. Nenhum script de deploy a inclui. Isso cria risco de a regra/dependência de custom claims estar conceitualmente prevista, mas não estar executando no projeto Firebase publicado.

**Ação:** decidir se ela continuará como Firebase Function. Se sim, atualizar runtime suportado, configurar build/deploy de Functions e verificar logs. Se não, mover explicitamente a responsabilidade para o backend admin e remover o código morto.

### A-10 — Médio: não há infraestrutura reprodutível completa

Faltam definição de serviço, pipeline e checklist executável que publiquem servidor, Functions, secrets, CORS, variáveis `VITE_*`, domínio, monitoramento e rollback como um conjunto. O Dockerfile é ponto de partida, mas não substitui a configuração da plataforma.

---

## 11. Inventário de achados e priorização

| ID | Severidade | Achado | Ação recomendada |
|---|---|---|---|
| A-01 | Crítico | Conta inativa/expirada pode gravar via SDK porque `isActiveOwner` não valida atividade. | Corrigir regras e criar teste no emulador. |
| A-02 | Crítico | Function mantém `admin`/`isActive` antigos ao sincronizar claims. | Remover claims gerenciadas antes de recompor e revogar tokens. |
| A-05 | Alto | Hosting/regras são publicados sem API/Functions. | Definir e automatizar arquitetura de deploy. |
| A-06 | Alto | WhatsApp e scheduler são desligados em produção. | Ocultar/remover ou implantar worker suportado. |
| A-11 | Alto | Sem E2E e sem validação de regras/estoque no emulador local. | Instalar Firebase CLI, automatizar em CI e incluir Playwright. |
| A-07 | Médio | Backup automático all-users em disco local. | Storage seguro/persistente, retenção e teste de restore. |
| A-08 | Médio | Restore por merge sem schema completo/rollback. | Validar formato, limitar itens e testar colisões. |
| A-09 | Médio | Function de claims pode não ser publicada; Node 18 legado. | Modernizar e incluir no deploy ou centralizar no backend. |
| A-10 | Médio | Infraestrutura/CI não é reprodutível de ponta a ponta. | IaC/pipeline/checklist pós-deploy. |
| A-03 | Médio | CSP inexistente. | Adicionar CSP e revisar HTML gerado. |
| A-04 | Médio | Rate limit em memória não escala. | Limite distribuído para operações sensíveis. |
| A-12 | Médio | Muitos listeners, sem índices compostos declarados/paginação. | Medir custos e paginar/consultar por filtros. |
| A-13 | Baixo | Rotas de tela são estado, sem deep link. | Adotar React Router se URLs compartilháveis forem requisito. |
| A-14 | Baixo | `whatsapp`, `new-service` e `subscription-expired` constam em `AppView`, mas não têm rota de renderização ativa. | Remover estados mortos ou concluir a integração. |

---

## 12. Plano de correção recomendado

### Bloqueadores antes de ampliar usuários

1. Corrigir A-01 e A-02; publicar rules/Function/backend e comprovar no emulador que usuário inativo não lê/escreve o que não deve e que admin rebaixado perde a claim.
2. Definir o destino da API de produção e automatizar o deploy completo. Confirmar as URLs `VITE_*` e CORS de produção.
3. Decidir o estado do WhatsApp: retirar de qualquer promessa comercial enquanto não houver worker/infraestrutura em produção, ou implementar essa infraestrutura.
4. Instalar Firebase CLI e executar `test:rules` e `test:stock` em CI, não apenas na máquina de desenvolvimento.

### Próxima fase

5. Criar E2E para login, cliente+serviço, agenda, garantia, despesa, O.S./estoque, pendência, backup/restore e bloqueio de assinatura.
6. Criar teste de desastre: exportar, restaurar em projeto/emulador limpo, verificar contagens, soft deletes e dados privados excluídos.
7. Mover backup automático para storage seguro e monitorado.
8. Medir leituras Firestore e bundle; aplicar paginação e índices apenas quando a telemetria demonstrar a necessidade.
9. Adicionar CSP, monitoramento de erros e alertas para backup/webhook/fiscal.

### Critério de liberação

O sistema deve ser considerado apto para uma liberação mais ampla somente quando os achados críticos forem resolvidos e comprovados por testes reais de regras, quando API/Functions estiverem publicadas e monitoradas, e quando os fluxos críticos passarem em ambiente de homologação com navegador.

---

## Conclusão

A aplicação tem uma fundação funcional e várias proteções bem direcionadas: schema nas regras, soft delete, transações de estoque, tratamento offline, validação de payloads e cobertura unitária de cobrança. O maior problema não é falta de módulos: é alinhar o modelo de segurança e a publicação ao que a interface promete. Priorizar autorização efetiva no Firestore, revogação confiável de claims e implantação completa da API reduzirá substancialmente o risco operacional.

**Auditoria concluída em 16/09/2026.**
