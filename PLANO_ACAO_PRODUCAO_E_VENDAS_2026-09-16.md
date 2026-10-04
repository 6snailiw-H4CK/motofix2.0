# Plano de ação: produção e início de vendas

**Base:** [Auditoria completa de 16/09/2026](AUDITORIA_COMPLETA_2026-09-16.md)  
**Objetivo:** levar o MotoFix a produção com segurança, validar a operação piloto e iniciar vendas sem prometer recursos ainda indisponíveis.  
**Regra de avanço:** uma fase só começa quando os critérios de aceite da anterior forem atendidos.

---

## Visão geral

```text
Fase 0 — Congelar e preparar ambiente
     ↓
Fase 1 — Corrigir segurança crítica
     ↓
Fase 2 — Tornar deploy reproduzível
     ↓
Fase 3 — Validar fluxos e recuperação
     ↓
Fase 4 — Piloto controlado
     ↓
Fase 5 — Abrir vendas
```

### Decisão comercial imediata

Até a conclusão da Fase 4, vender o MotoFix como sistema de gestão de oficina com:

- clientes, motos, serviços e retornos;
- agenda, gastos, pendências, garantias e relatórios;
- caixa, mercadorias e estoque;
- backup operacional.

**Não prometer nem divulgar como funcional em produção neste momento:** WhatsApp automatizado, emissão fiscal em produção e uso offline como garantia absoluta de recuperação de dados. Esses itens devem ficar como “em implantação controlada” até homologação própria.

---

## Fase 0 — Preparação e congelamento

**Objetivo:** criar uma linha de partida segura e evitar que correções críticas sejam misturadas com novas funcionalidades.

| Ação | Resultado esperado | Aceite |
|---|---|---|
| Criar branch de estabilização, por exemplo `release/production-readiness` | correções de produção isoladas | branch criada e protegida. |
| Registrar variáveis e responsáveis por ambiente | matriz de ambiente sem segredos no Git | `.env.example` atualizado; valores reais apenas no gerenciador de segredos. |
| Revisar `.gitignore` | nenhuma credencial, backup ou sessão pode entrar no Git | `firebase-service-account.json`, `.env`, certificados, `storage/`, `backups/` e diagnósticos incluídos/confirmados. |
| Criar projeto/ambiente de homologação Firebase separado | testes não tocam produção | projeto, Auth, Firestore e Hosting de homologação disponíveis. |
| Instalar ferramentas de validação | testes locais/CI reproduzíveis | Firebase CLI, Java compatível com emuladores e Node LTS instalados. |

**Não avançar se:** houver credencial rastreada, projeto de teste apontando para produção, ou variáveis de produção em arquivos versionados.

---

## Fase 1 — Segurança e controle de acesso

**Objetivo:** impedir que a interface seja a única barreira de assinatura e garantir revogação real de privilégios.

### 1.1 Corrigir autorização de usuários ativos

**Problema:** `isActiveOwner()` em `firestore.rules` hoje só confirma UID autenticado; não confirma atividade nem assinatura.

**Ações:**

1. Definir a política de acesso: usuário ativo significa apenas conta liberada, ou conta com assinatura ativa e período válido.
2. Sincronizar essa decisão para um custom claim controlado pelo servidor, por exemplo `isActive`.
3. Alterar `isActiveOwner()` para exigir `request.auth.token.isActive == true`.
4. Aplicar essa função a todas as leituras/escritas que devam ser bloqueadas para usuários inativos; manter apenas as exceções conscientemente públicas, como tela de checkout.
5. Revogar refresh tokens ao desativar uma conta ou cancelar acesso imediatamente.

**Testes obrigatórios no emulador:**

- usuário ativo escreve em dados próprios;
- usuário inativo não cria, altera, arquiva nem restaura dados;
- outro usuário não acessa dados alheios;
- admin com claim válido mantém os acessos administrativos necessários;
- usuário expirado acessa apenas o fluxo explicitamente permitido.

### 1.2 Corrigir sincronização de custom claims

**Problema:** `functions/index.js` preserva `admin` e `isActive` preexistentes ao montar claims, mesmo depois de rebaixar/desativar uma pessoa.

**Ações:**

1. Separar claims gerenciadas (`admin`, `isActive`) de claims não gerenciadas.
2. Remover explicitamente as claims gerenciadas antigas antes de aplicar o novo estado.
3. Revogar tokens quando `admin` ou `isActive` mudar.
4. Definir uma única fonte de verdade: documento de usuário + processo servidor confiável, ou Stripe webhook + processo servidor. Não permitir atualizações de role pelo navegador.
5. Atualizar o runtime da Function para uma versão Node suportada e incluí-la no deploy.

**Testes obrigatórios:**

- promoção a admin concede claim;
- rebaixamento remove claim;
- ativação concede claim;
- desativação remove claim;
- token anterior deixa de conceder acesso após revogação/renovação.

### Critério de aceite da Fase 1

- regras passam no Firebase Emulator;
- testes de promoção, rebaixamento, ativação e desativação estão automatizados;
- um usuário bloqueado não consegue escrever via SDK/DevTools;
- revisão manual confirma que nenhum campo gravável pelo navegador permite elevar privilégio ou reativar conta.

### Atualização de implementação local — 03/10/2026

- `isActiveOwner` e `isAdmin` agora consultam o perfil atual; perfil inativo não lê/escreve subcoleções e role `admin` sem custom claim não concede privilégio.
- A Function remove claims gerenciadas antigas antes de sincronizar; somente perfil ativo com role admin recebe a claim `admin`.
- O app escuta o documento do perfil em tempo real, bloqueia contas inativas e limpa listeners/dados em memória.
- APIs de backup, reset, fiscal e WhatsApp consultam o perfil atual; reset exige claim admin e role admin. A API fiscal também exige flag de backend e admin/beta allowlist.
- Validação local: typecheck, 14 testes do gate, assertions estáticas, 31 testes Stripe, build do servidor e cenários de regras no Firestore Emulator passaram.
- **Ainda não publicado:** regras Firestore, Cloud Function e backend. A proteção não vale em produção até publicar cada camada; configurar `FISCAL_MODULE_ENABLED`/`FISCAL_BETA_EMAILS` junto das flags Vite no ambiente do servidor.

---

## Fase 2 — Publicação e infraestrutura reproduzível

**Objetivo:** publicar frontend, API e funções como um único release rastreável.

### 2.1 Escolher a arquitetura de produção

Recomendação prática:

| Componente | Destino recomendado | Observação |
|---|---|---|
| SPA | Firebase Hosting | manter cache e domínio principal. |
| Firestore Rules | Firebase deploy | publicar junto do release. |
| API Express | Cloud Run | processa Stripe, backup, reset e fiscal. |
| Custom claims | Cloud Functions Gen 2 ou serviço admin dedicado | deve ter deploy e logs próprios. |
| Backups automáticos | Cloud Storage criptografado | não usar disco efêmero do container. |
| Segredos | Secret Manager | Stripe, Focus NFe, Firebase Admin e chaves de IA. |

Se optar por outra plataforma, o requisito é o mesmo: API persistente/observável, secrets fora do Git e URLs estáveis.

### 2.2 Implementar deploy

1. Criar configuração de Cloud Run ou equivalente para o servidor atual.
2. Configurar URL pública da API e preencher no build as variáveis necessárias:
   - `VITE_STRIPE_API_URL`
   - `VITE_FISCAL_API_URL`
   - `VITE_BACKUP_API_URL`
   - `VITE_DATA_RESET_API_URL`
   - `VITE_WHATSAPP_API_URL` somente se o módulo existir em produção.
3. Configurar `APP_URL`, `FRONTEND_URL` e `CORS_ORIGINS` com os domínios reais, sem localhost.
4. Publicar Functions e regras no mesmo pipeline.
5. Criar CI com, no mínimo: lint, build, testes unitários, regras no emulador e revisão de segredo.
6. Criar release com versão/tag, changelog curto e rollback documentado.

### 2.3 Endurecer operação do servidor

- trocar rate limit em memória por solução compartilhada se houver múltiplas réplicas;
- adicionar Content-Security-Policy compatível com Firebase/Stripe;
- configurar healthcheck, logs estruturados, alertas de erro e retenção de logs;
- limitar tamanho/quantidade de restore e registrar auditoria no servidor;
- configurar armazenamento de backup criptografado, retenção e acesso de menor privilégio.

### Critério de aceite da Fase 2

- deploy em homologação publica SPA, API e Functions;
- `GET /api/health` responde no domínio configurado;
- chamadas de Stripe, backup e fiscal não recebem HTML da SPA;
- CORS aceita somente origens autorizadas;
- segredo não aparece em bundle, log, Git ou documentação;
- rollback de uma versão é praticado uma vez em homologação.

---

## Fase 3 — Homologação técnica e operacional

**Objetivo:** provar os fluxos que podem causar perda financeira, perda de dado ou bloqueio de cliente.

### 3.1 Bateria automática mínima

| Grupo | Casos mínimos |
|---|---|
| Regras Firestore | owner, inativo, admin, invasor, delete físico, soft delete e restore. |
| Estoque | finalizar O.S., repetição, reabrir, cancelar, estoque insuficiente e concorrência. |
| Stripe | checkout sandbox, webhook assinado, pagamento aprovado/falhado, cancelamento e portal. |
| Backup | export completo, restore em ambiente limpo, documento inválido, colisão de ID e retenção. |
| Offline | criar/editar cliente e garantia, reconectar, falha de replay e duas abas. |
| Build | cliente, servidor e service worker. |

### 3.2 E2E de interface

Instalar Playwright e automatizar, no mínimo:

1. login e logout;
2. cadastro de cliente e moto;
3. registro de serviço e criação de retorno;
4. agendamento e conclusão;
5. garantia e geração do certificado;
6. gasto e relatório;
7. produto, O.S., pagamento, baixa e estorno de estoque;
8. pendência e quitação;
9. backup/restore em homologação;
10. usuário expirado/inativo bloqueado fora do checkout.

### 3.3 Homologação manual guiada

Usar uma conta de oficina fictícia e dados prefixados com `TESTE -`. Fazer uma pessoa não desenvolvedora seguir um roteiro e registrar:

- passos executados;
- resultado esperado e obtido;
- evidências/screenshot;
- defeitos, severidade e decisão.

**Importante:** não enviar WhatsApp real, não emitir NFS-e real e não testar com dados pessoais de clientes.

### Critério de aceite da Fase 3

- 100% dos testes críticos passam;
- nenhum defeito crítico ou alto permanece aberto;
- restore comprovado em ambiente limpo;
- fluxo de estoque comprovado no emulador;
- uma oficina piloto completa a rotina básica sem ajuda técnica.

---

## Fase 4 — Piloto controlado

**Objetivo:** validar valor, suporte e operação real antes de escalar aquisição.

### Escopo do piloto

- 3 a 5 oficinas parceiras;
- 14 a 30 dias;
- onboarding conduzido;
- uma pessoa responsável por suporte e acompanhamento;
- backup inicial antes de importar/cadastrar dados;
- canal único de suporte e registro de incidentes.

### Métricas de saída

| Métrica | Meta inicial |
|---|---|
| Oficina que conclui perfil e primeiro cadastro | 100% dos pilotos. |
| Primeiro serviço registrado | até o primeiro dia de uso. |
| Uso semanal de agenda/caixa/retornos | ao menos 70% dos pilotos. |
| Erros críticos de dados/estoque | 0. |
| Recuperação de backup testada | 100% em homologação; ao menos uma simulação assistida. |
| Satisfação de uso | coletar nota e três principais obstáculos por oficina. |

### WhatsApp e fiscal no piloto

- manter desligados por padrão até haver deploy, homologação e política de consentimento;
- se o fiscal for testado, usar apenas homologação e usuários explicitamente habilitados;
- não ativar IA ou automação de mensagem sem aprovação, transparência e configuração de dados.

### Critério de aceite da Fase 4

- pilotos usam os fluxos principais por pelo menos duas semanas;
- não há incidente de acesso indevido, perda de dados ou estoque inconsistente;
- os principais problemas de onboarding foram corrigidos ou possuem procedimento de suporte;
- existe decisão documentada de prosseguir, pausar ou ampliar o piloto.

---

## Fase 5 — Início de vendas

**Objetivo:** vender uma oferta clara, com operação de suporte e cobrança pronta.

### 5.1 Produto e proposta comercial

Preparar:

- página de vendas com promessa limitada aos módulos homologados;
- plano, preço, período de teste/garantia e política de cancelamento;
- demonstração curta com cenário de oficina;
- checklist de implantação: perfil, clientes, serviços, produtos, equipe e backup;
- termos de uso, política de privacidade e orientação LGPD para dados de clientes;
- FAQ sobre acesso, backup, suporte, exportação e cancelamento.

### 5.2 Operação de vendas e suporte

| Processo | Definição necessária |
|---|---|
| Cadastro | quem aprova/ativa e qual é o prazo. |
| Pagamento | Stripe em produção, webhook monitorado e tratamento para falha/past due. |
| Onboarding | reunião/guia, primeiro cliente, primeiro serviço e importação. |
| Suporte | canal, horário, tempo alvo de resposta e responsáveis. |
| Incidente | classificação, comunicação, backup e recuperação. |
| Cancelamento | acesso até a data contratada, exportação e retenção/anonimização de dados. |
| Métricas | leads, conversão, ativação, uso semanal, churn e motivos de cancelamento. |

### 5.3 Checklist de go-live comercial

- [ ] Fases 1 a 4 concluídas e evidenciadas.
- [ ] Domínio, HTTPS, CORS e URLs de API validados.
- [ ] Stripe de produção testado com transação controlada e webhook confirmado.
- [ ] Backup automático seguro e restore testado.
- [ ] Monitoramento e alertas funcionando.
- [ ] Oferta comercial não menciona recursos desativados.
- [ ] Suporte possui roteiro de onboarding e incidente.
- [ ] Documentos legais revisados para o modelo de operação.
- [ ] Primeiro canal de aquisição definido (indicação, demonstração local, WhatsApp manual ou parceria).

---

## Ordem prática de execução

1. **Hoje:** Fase 0, instalar Firebase CLI e proteger arquivos sensíveis.
2. **Depois:** Fase 1, corrigir claims e regras; é o bloqueador principal.
3. **Em seguida:** Fase 2, publicar homologação completa e configurar secrets/CORS.
4. **Depois:** Fase 3, automatizar emulador + E2E e executar o roteiro manual.
5. **Só então:** Fase 4 com poucas oficinas parceiras.
6. **Após dados do piloto:** Fase 5 e abertura gradual de vendas.

## Responsabilidade sugerida

| Frente | Responsável sugerido |
|---|---|
| Regras, claims, backend e deploy | desenvolvimento técnico. |
| Ambiente, secrets, domínio e monitoramento | responsável técnico/infraestrutura. |
| Roteiros e validação de oficina | produto + dono da oficina piloto. |
| Oferta, onboarding e suporte | comercial/operação. |
| Go/no-go final | responsável do produto, baseado nas evidências das fases. |

---

## Definição de pronto para vender

O MotoFix estará pronto para iniciar vendas quando: a autorização não puder ser contornada pelo SDK; a revogação de acesso funcionar; frontend, API e Functions forem implantados de forma reproduzível; backups puderem ser recuperados; fluxos críticos estiverem testados; e a oferta comercial refletir apenas funcionalidades realmente disponíveis em produção.

**Plano criado em 16/09/2026.**
