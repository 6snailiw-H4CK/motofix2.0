# MotoFix — resumo de continuidade

Atualizado em 2026-10-10. Este arquivo registra o estado do trabalho para o próximo modelo/operador.

## Estado atual

O trabalho concluiu a implementação local da **P1.5.17 — Correções finais dos bloqueios de autorização**. O passo seguinte solicitado é a **auditoria independente P1.5.18**. Não declarar a migração aprovada.

**A migração permanece bloqueada e não aprovada.** Não executar dry-run, backfill ou apply contra Firebase real sem nova autorização explícita e sem concluir a auditoria independente.

## P1.5.17 — correções locais dos bloqueios de autorização

- A CLI valida trust anchor, autorização assinada e principal declarado da credencial antes de importar o bootstrap que inicializa Firebase Admin. A credencial JSON é lida uma vez; o mesmo objeto carregado e validado é entregue a `cert()`.
- Novo `server/firebaseAdminMigration.ts` inicializa somente a partir de service account explícita, rejeita App Admin preexistente e não usa ADC. Isso comprova apenas material/configuração local; não prova aceitação da identidade pelo Google ou o destino remoto alcançado.
- A CLI exige o provider externo antes de importar/inicializar Admin. O provider continua ausente (`null`), portanto a execução operacional permanece bloqueada.
- O registry agora recebe o escopo assinado completo (ID, projeto, ambiente, operação, principal, hash, emissão e expiração), e sua interface exige reserva atômica/durável/shared. Estados persistentes do contrato: ID livre, reservado/consumido ou escopo incompatível. Falhas de storage, falhas parciais e interrupções nunca liberam reserva; retry exige nova autorização.
- A proteção local usa estado por ID/scope para impedir duplicação concorrente no processo e retorna um handle one-shot ligado a um único adapter. Essa proteção em memória não substitui nem demonstra exclusividade distribuída.
- O adapter verifica a validade em cada nova fronteira de leitura/gravação. Expiração impede operações novas; não cancela I/O que o SDK já iniciou.
- Testes ajustados para assinatura alterada, escopo/ID duplicado, concorrência local, falha após reserva, expiração e ausência do provider. O teste de CLI comprova falha por trust anchor ausente antes do bootstrap mesmo com caminho de credencial inválido. Como trust anchor e provider estão ausentes, não há caminho local seguro para exercitar a verificação de assinatura da CLI em caso de chave configurada; a assinatura inválida é coberta pelo verificador criptográfico unitário.
- Validação executada: `npm run test:access-projection-migration` (**49 testes aprovados, 0 falhas**); `npm run lint` (TypeScript `tsc --noEmit`, aprovado); `git diff --check` e `git diff --cached --check` aprovados.
- Nenhum Emulator, teste com Firebase, CLI de migração, dry-run, backfill, apply, deploy, stage, commit, push ou operação Firebase real foi executado. Nenhuma chave, credencial ou provider foi configurado. Auditoria independente P1.5.18 pendente.

## P1.5.15 — decisões e alterações locais

- Política de replay escolhida: **autorização de uso único**. `OperationalAuthorizationReplayRegistry.consume()` precisa realizar reserva atômica do ID em armazenamento confiável compartilhado por processos e máquinas. Não há provider configurado; `getOperationalAuthorizationReplayRegistry()` retorna `null`, mantendo a CLI fechada.
- Falha/interrupção após o consumo não libera o ID. Apply parcial requer novo dry-run revisado e nova autorização/ID. Validade e hash limitam escopo, mas não substituem a reserva atômica.
- Principal suportado pelo código: somente `client_email` de JSON `type=service_account` explícito carregado para criar novo Firebase Admin App; a autorização deve assinar exatamente esse principal. ADC, impersonação, credenciais de usuário e App pré-existente não são verificáveis por essa política e são recusados.
- A identificação é local e relaciona o JSON carregado à credencial passada ao novo App; não comprova aceitação da chave pelo Google, identidade autenticada remota nem destino real. Validação externa aprovada ainda é necessária. Não provisionar trust anchor, registry ou credenciais.
- O adapter remoto requer autorização validada, principal, ID já consumido e valida novamente nos pontos de I/O. O Emulator dedicado fixo continua limitado a testes locais.
- `runAccessProjectionMigration()` permanece motor de domínio genérico que aceita adapters em memória, sem ser fronteira de segurança. Novo script operacional que reuse o core precisa implementar as barreiras CLI/credencial/replay/adapter e testes próprios.
- Testes adicionados/alterados em `scripts/access-projection-backfill.test.ts`: identidade de principal esperada vs mudança de credencial simulada, ausência de identidade, rejeição de adapter remoto sem autorização antes de criar referências, consumo concorrente simulado do mesmo ID, e retry bloqueado depois de falha parcial simulada. Os testes de identidade e registry são mocks locais; não provam Firebase Auth, ADC, rede ou atomicidade de um backend distribuído real.
- Novo `server/firebaseCredentialIdentity.ts` resolve somente identidade declarada de service account explícito. Novo `scripts/access-projection-replay-registry.ts` define a interface e falha fechado sem provider.
- `docs/P1.5.2-RULES-TRANSITION.md` agora documenta a política one-use, necessidade de registry externo, suporte restrito de credenciais e separação entre core de domínio e segurança operacional.
- Validação final P1.5.15: `npm run lint` passou; `npm run test:access-projection-migration` passou (**46 testes, 0 falhas**); `git diff --check` e `git diff --cached --check` passaram. A suíte CLI/unitária não executa Emulator nem operações Firebase reais.
- Nenhuma migração, dry-run/backfill/apply, consulta Firebase, deploy, stage, commit ou push foi realizada. Estado staged/unstaged anterior foi preservado. Próximo passo: auditoria estritamente read-only P1.5.16.

## P1.5.13 — estado desta etapa

Correções locais feitas:

- `scripts/access-projection-operational-authorization.ts`
  - Adiciona autorização operacional assinada Ed25519, com escopo exato de projeto, ambiente, operação e hash do relatório; valida campos, canonicalização, validade de no máximo 30 minutos e assinatura.
  - A chave pública institucional confiável continua `null`, bloqueando deliberadamente uso remoto com `operational_authorization_trust_anchor_not_configured`.
  - Autorização verificada é congelada e só pode ser reconhecida em memória pelo `WeakSet`; o adapter também revalida expiração/escopo nos limites de leitura e gravação.
- `server/firestoreProjectIdentity.ts`
  - Expõe o reconhecimento restrito do Emulator local dedicado; isso não constitui autorização para migração real.
- `scripts/access-projection-firestore-adapter.ts`
  - Confere destino local e autorização antes de qualquer leitura, claims, página de perfis, callback/retry da transação e gravação, mantendo uma instância única de Firestore.
- `scripts/migrate-access-projections.ts`
  - Requer `--target-environment` e `--operational-authorization`, valida antes de importar/inicializar Admin e vincula a autorização ao hash do relatório quando apply.
- `scripts/access-projection-backfill.ts`
  - Documento Firestore só é canônico com `Timestamp` real em `evaluatedAt` e `Timestamp | null` em `validUntil`; representações JSON do relatório podem usar ISO canônico.
  - Diferencia incompletude reparável (ex.: `validUntil` ausente) de tipo malformado e contradição semântica. Incompletos podem receber somente a decisão recalculada pela política; projeções ambíguas/contraditórias ficam em review e não são gravadas.
  - As invariantes aceitas correspondem à política central: owner permanente sem expiração; manual/Stripe permitidos com expiração posterior a `evaluatedAt`; negação com `source=none`, expiração nula e motivo de negação; `evaluatedAt` não participa da igualdade da decisão, porém seus tipos e semântica ainda são validados.
- `scripts/access-projection-backfill.test.ts`, `scripts/migrate-access-projections-cli.test.ts`
  - Adicionam testes de timestamps, formatos JSON, combinações semânticas, assinatura/escopo/expiração, trust anchor ausente e bloqueio da CLI antes do Admin. Testes de CLI usam diretórios temporários criados pelo teste e removem somente esses próprios diretórios.
- `docs/P1.5.2-RULES-TRANSITION.md`
  - Atualiza o plano com os gates de reconciliação, compatibilidade de tenants, coordenação backend/Functions/Rules, verificação de owner/claims, monitoramento, rollback e distinção entre estado local e produção desconhecida.

Validação desta etapa:

- `npm run test:access-projection-migration`: **43 testes passaram, 0 falharam** na última execução registrada. A suíte não usa Emulator/Firebase real; inclui testes de memória e testes CLI de rejeição antes da inicialização do Admin.
- `npm run lint` (`tsc --noEmit`): passou antes do último acréscimo de caso de teste; repetir na conclusão para cobrir o estado final.
- Não executar `npm run test:access-projection-emulator`: o teste altera/remove documentos do Emulator e não se presume que o Emulator local esteja descartável.
- Nenhum dry-run, backfill, apply, acesso a Firebase real, deploy, stage, commit ou push foi realizado nesta P1.5.13.

Limitações que continuam:

- O SDK não prova localmente o destino remoto efetivamente alcançado nem a identidade de ADC. O programa valida somente a configuração observável e exige uma autorização assinada por um processo externo que comprove projeto, endpoint e principal antes da assinatura.
- Como a chave institucional confiável permanece `null`, nenhuma operação remota é permitida. Não provisionar a chave sem governança/rotação/revogação formal aprovada por auditoria independente.
- O programa não fornece registro distribuído de autorização consumida; prevenir replay depende do procedimento externo controlar IDs de autorização como uso único.
- Hash de relatório é integridade do conteúdo canônico coberto, não assinatura, identidade do produtor ou prova da veracidade das fontes.
- Testes não comprovam ADC real, Firebase Auth real, destino remoto, estado da produção ou atomicidade entre Auth e Firestore. A transação protege apenas dados Firestore lidos/escritos dentro dela.
- Rules não foram alteradas nem publicadas. O estado atual de produção e a compatibilidade de seus perfis continuam desconhecidos.

## Contexto e decisões anteriores

- As etapas anteriores P1.5.5–P1.5.9 criaram/endureceram a política de acesso e as ferramentas de backfill. Entre as proteções existentes: owner preflight, leitura de claims, aprovação de relatório, fingerprints de decisão, revalidação transacional, idempotência e rejeição de relatórios interrompidos.
- A auditoria P1.5.10 foi somente leitura e reprovou a prontidão para execução. Os principais achados foram: `projectId` local não prova sozinho o destino remoto real; normalização podia equiparar projeção incompleta a uma projeção completa; validação do relatório aprovado precisava conferir estrutura e consistência com maior rigor.
- A P1.5.11 corrigiu esses pontos localmente, sem tocar em produção.
- O contrato central em `server/accountAccess.ts` define `AccessProjection` com seis campos: `allowed`, `source`, `validUntil`, `evaluatedAt`, `policyVersion` e `reason`. `validUntil: null` é legítimo, mas ausência do campo não é equivalente a `null`.
- SHA-256 do relatório é uma verificação de integridade do conteúdo coberto; **não é assinatura**, não identifica quem produziu o relatório e não prova a veracidade dos dados de origem.

## Mudanças realizadas na P1.5.11

- `scripts/access-projection-backfill.ts`
  - Exige estrutura/tipos canônicos da projeção; diferencia projeção ausente, incompleta, expirada, inconsistente e consistente.
  - Uma projeção incompleta (inclusive `validUntil` ausente) não é classificada como inalterada. Projeção malformada/ambígua não é sobrescrita; a correção não concede acesso.
  - Continua ignorando diferenças isoladas de `evaluatedAt` nas comparações decisórias/fingerprints, mas preserva mudanças relevantes em role, atividade, billing, subscription e entitlements.
  - Valida o relatório de aprovação: schema/política/projeto/modo, owner preflight, interrupção, campos exatos, tipos, fingerprints, unicidade de referências, coerência entre proposta e classificação e totais reconciliados.
  - Exige coerência do registro do owner para aprovar o relatório; falha de validação retorna erro seguro.
- `server/firestoreProjectIdentity.ts`
  - Recusa endpoint/configuração não aprovada, incluindo host alternativo, Emulator fora da exceção isolada de testes, domínio Google não padrão, proxies e overrides de TLS/certificados.
  - A exceção Emulator é limitada ao projeto `motofix-access-projection-emulator-test` em loopback, com serviço/porta/SSL do cliente compatíveis.
  - Compara o projeto do cliente com o projeto esperado, mas isso comprova apenas configuração observável localmente, não a identidade remota efetiva do destino autenticado via ADC.
- `scripts/migrate-access-projections.ts`
  - Bloqueia endpoint não aprovado antes de inicializar/importar o Firebase Admin.
  - Valida estrutura do relatório antes da inicialização do Admin e usa parser estrito que rejeita chaves JSON duplicadas.
- `scripts/access-projection-report-file.ts`
  - Parser de JSON com rejeição de chaves duplicadas e reserva de arquivo de saída sem sobrescrever arquivo existente.
- `scripts/access-projection-firestore-adapter.ts`
  - Usa as mesmas verificações do projeto/endpoint para o cliente Firestore usado pelo adapter.
- `scripts/access-projection-backfill.test.ts`, `scripts/migrate-access-projections-cli.test.ts`, `scripts/access-projection-firestore-emulator.test.ts`
  - Cobrem as novas condições de projeção, relatório, ambiente e transação.
- `docs/P1.5.2-RULES-TRANSITION.md`
  - Documenta os limites do preflight local e exige confirmação independente do destino antes de qualquer futura execução controlada.

## Validação executada na P1.5.11

Resultados finais após as últimas alterações:

- `npm run test:access-projection-migration`: **38 testes passaram, 0 falharam**.
- `npm run lint` (`tsc --noEmit`): **passou**.
- `npm run test:access-projection-emulator`: **4 testes passaram, 0 falharam**, usando exclusivamente o Firestore Emulator local e o projeto de teste fixo.
- `git diff --check`: **passou**.

O Emulator emitiu um aviso de `MetadataLookupWarning`, sem falha dos testes. O arquivo `firestore-debug.log` gerado pelo Emulator foi removido depois da validação.

Os testes do Emulator validam transações Firestore locais; eles **não** provam comportamento de Firebase Auth real, ADC real ou identidade do projeto remoto.

## Limitações e riscos residuais

- A propriedade `projectId` e configurações locais do SDK não provam criptograficamente o projeto remoto efetivamente atendido por ADC/credenciais. A ferramenta falha fechada em configurações locais detectáveis, mas não deve ser considerada autorização suficiente para execução real.
- Não foi feita consulta remota para validar destino, intencionalmente.
- Não existe atomicidade entre leitura de claims no Firebase Auth e transação Firestore. Falhas de claims devem continuar bloqueando a escrita; uma auditoria posterior deve revisar essa janela de concorrência.
- A validação estrutural do relatório e os cenários de ambiguidades devem ser reavaliados independentemente antes de autorizar qualquer uso real.
- Nenhum teste de CLI completo com apply foi feito contra Firebase real. Emulator cobre as operações transacionais locais, não todas as integrações reais.

## Regras para continuação

1. Antes de editar, consultar `git status --short`. O worktree já estava amplamente alterado antes desta etapa, com mudanças staged, unstaged e arquivos untracked. **Preservar tudo**; não limpar, reverter, sobrescrever ou stagear trabalho preexistente.
2. Respeitar as restrições já dadas: não acessar Firebase real, não executar dry-run/backfill/apply real, não alterar `.env`, produção, claims, entitlements, billing, `ownerAccess`, `system/access_config`, Rules, índices ou Stripe; não fazer deploy, stage, commit ou push.
3. O próximo trabalho esperado é auditoria independente P1.5.14; deve ser estritamente somente leitura conforme solicitado. Não executar operações remotas ou alterar arquivos durante essa auditoria.
4. Antes de qualquer futura etapa controlada em ambiente real, exigir procedimento formal que comprove e aprove independentemente projeto, endpoint e identidade ADC efetivos. Não tentar comprovar isso com chamadas diagnósticas contra produção sem autorização explícita.
5. Não considerar a migração aprovada apenas porque os testes locais/Emulator passaram.

## Worktree conhecido

O `git status --short` ao concluir continuava mostrando numerosas alterações staged/unstaged e arquivos untracked preexistentes no projeto, além dos arquivos da sequência de access-projection. Esse estado foi preservado; nenhum stage, commit, reset, checkout ou clean foi feito. Consultar o status atual antes de qualquer continuação, pois ele pode ter mudado.
