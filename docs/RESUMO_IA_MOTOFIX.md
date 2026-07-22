# Resumo executivo para IA do sistema MotoFix

Este arquivo foi criado para servir como resumo de alto nível do sistema, permitindo que outra ferramenta de IA entenda o funcionamento principal sem precisar ler todo o projeto de uma vez.

Objetivo: explicar o que o sistema faz, como os dados são organizados, quais são os fluxos principais e onde cada informação é salva.

---

## 1. O que é o MotoFix

O MotoFix é um sistema web para gestão de oficina/motos com foco em:

- cadastro de clientes e veículos;
- registro de serviços/manutenções;
- ordem de serviço representada como manutenção;
- retorno/recorrência de serviços;
- agenda/atendimentos;
- garantias;
- despesas e financeiro;
- lembretes via WhatsApp;
- configurações da oficina;
- painel administrativo e controle de assinatura.

Em termos simples: ele funciona como um CRM operacional para oficina, com foco em recorrência, cobrança de serviços e acompanhamento de clientes.

---

## 2. Arquitetura geral

### Frontend
- React 19 + TypeScript + Vite
- UI baseada em componentes e hooks
- Parte principal do fluxo fica em:
  - src/App.tsx
  - src/components/
  - src/hooks/
  - src/services/
  - src/types.ts

### Backend
- Node.js + Express
- Arquivo principal: server.ts
- Rotas e lógica auxiliares de backup, pagamentos e integração externa em server/

### Banco de dados
- Firebase Firestore
- Autenticação via Firebase Auth
- Dados principais ficam organizados por usuário em subcoleções dentro de users/{uid}

---

## 3. Estrutura principal de dados no Firestore

A estrutura central é por usuário. Cada empresa/usuário possui seus próprios dados em:

users/{uid}
users/{uid}/clients
users/{uid}/maintenances
users/{uid}/warranties
users/{uid}/appointments
users/{uid}/expenses
users/{uid}/products
users/{uid}/cash_launches
users/{uid}/message_logs
users/{uid}/settings/config

### Significado de cada coleção

- clients: clientes, motos, contato, recorrência, status, valores e dados de relacionamento.
- maintenances: registros de serviço/manutenção/ordem de serviço. É a principal fonte de histórico de atendimento.
- warranties: garantias e itens com prazo.
- appointments: agenda de compromissos/atendimentos.
- expenses: despesas da oficina.
- products: catálogo de mercadorias/produtos.
- cash_launches: lançamentos do caixa / vendas / pedidos / notas.
- message_logs: logs de mensagens enviadas por WhatsApp/email.
- settings/config: configurações da oficina, tipos de serviço, tipos de óleo, categorias de garantia e preferências.

---

## 4. Modelo de negócio principal

### Cliente
Cada cliente possui:
- nome
- telefone
- modelo da moto
- tipo de óleo
- preço de óleo
- última manutenção
- próxima manutenção
- recorrência em dias
- status (OK, WARNING, OVERDUE)
- valores e status de pagamento

### Manutenção / ordem de serviço
A manutenção representa o registro principal do atendimento. Ela contém:
- cliente associado
- data do serviço
- tipo de serviço
- valor
- observações
- status de pagamento
- dados de recorrência

Importante: neste sistema, a “ordem de serviço” não é uma coleção separada. O fluxo de ordem de serviço é representado principalmente por documentos em maintenances.

### Status do cliente
O status do cliente é calculado com base na próxima manutenção:
- OK: em dia
- WARNING: próximo do vencimento
- OVERDUE: atrasado

---

## 5. Fluxo principal: cadastro de cliente e serviço

Este é o fluxo central do sistema.

### Passo a passo
1. O usuário entra no formulário de cadastro/serviço.
2. O formulário coleta:
   - nome do cliente
   - telefone
   - moto
   - tipo de serviço
   - data do atendimento
   - valor
   - status de pagamento
   - observações
3. O sistema salva:
   - um documento em users/{uid}/clients
   - um documento em users/{uid}/maintenances
4. O sistema atualiza o cliente com:
   - última manutenção
   - próxima manutenção
   - status da recorrência
   - último tipo de serviço
   - último valor
   - dados de pagamento

### Onde isso acontece
- componente principal: src/components/clients/ClientForm.tsx
- lógica de persistência: src/hooks/useClientActions.ts
- repositório de escrita: src/services/clientRepository.ts
- serviço especializado: src/services/clientSaveService.ts

### Resultado final
O sistema mantém tanto o cadastro do cliente quanto o histórico do atendimento.

---

## 6. Fluxo específico: troca de óleo

A troca de óleo é um fluxo muito importante e tratado como um tipo de serviço especial.

### Como funciona
- o tipo de serviço pode ser identificado como “troca de óleo” com base no helper de tipos de serviço;
- o sistema armazena:
  - oilType
  - oilPrice
- esses dados ficam tanto no cliente quanto na manutenção;
- quando o serviço é registrado, ele ajuda a definir recorrência futura.

### Onde isso é tratado
- src/lib/serviceTypes.ts
- src/components/clients/ClientForm.tsx
- src/types.ts
- src/hooks/useMaintenanceActions.ts

### Regra de negócio importante
Se o serviço for uma troca de óleo, o sistema costuma associar a manutenção a uma recorrência futura de revisão/retorno.

---

## 7. Fluxo de recorrência / retorno

O sistema foi pensado para clientes que voltam periodicamente.

### Como funciona
1. Quando um serviço é salvo, o sistema calcula a próxima data de manutenção.
2. O cliente recebe:
   - lastMaintenanceDate
   - nextMaintenanceDate
   - recurrenceDays
   - status calculado
3. O sistema pode gerar lembretes e notificações para o cliente.
4. O cliente pode ser mostrado na tela de retornos/recorrência.

### Arquivos relevantes
- src/hooks/useMaintenanceActions.ts
- src/hooks/useClientStatusSync.ts
- src/hooks/useWhatsAppReminderActions.ts
- src/components/returns/ReturnsView.tsx

### Lógica de recorrência
A recorrência é baseada em dias e na última manutenção registrada.

---

## 8. Fluxo de solicitações e agendamento

Além do cadastro direto de serviços, o sistema também suporta:

- agendamento de atendimentos em appointments
- formulário de agenda
- conclusão e exclusão de atendimentos
- histórico de relacionamento com o cliente

### Onde isso fica
- src/components/appointments/AppointmentsView.tsx
- src/components/clients/ClientsScheduleView.tsx
- src/hooks/useAppointmentActions.ts

---

## 9. Fluxo financeiro e pendências

O sistema também trabalha com cobrança e pagamentos.

### O que existe
- manutenção com status de pagamento
- valor pago / saldo devedor
- pendências de pagamento
- gastos da oficina
- dashboard financeiro
- lançamentos de caixa

### Onde ficam os dados
- maintenances: pagamentos e valores da manutenção
- expenses: despesas da oficina
- cash_launches: lançamentos financeiros/caixa

### Regras principais
- uma manutenção pode estar como Pago, Pendente ou Parcial
- o saldo devedor é calculado com base no valor do serviço e no valor pago

---

## 10. Fluxo de configurações da oficina

As configurações ficam em users/{uid}/settings/config.

### Exemplo de dados configuráveis
- nome da oficina
- tipos de serviço
- tipos de óleo
- categorias de garantia
- preferências de funcionamento
- opções de backup e sincronização

### Onde isso é editado
- src/components/settings/SettingsView.tsx
- src/hooks/useSettingsActions.ts

### Importante
O sistema usa as configurações para controlar o formulário de serviço, opções do select e regras operacionais.

---

## 11. Fluxo de backup, restauração e sincronização offline

O sistema possui mecanismos de:
- backup automático
- exportação/importação de dados
- sincronização offline
- fila de escritas quando não há internet

### Arquivos importantes
- server/automaticBackup.ts
- server/backupRoutes.ts
- src/services/firestoreOfflineQueue.ts
- src/hooks/useOfflineSyncStatus.ts

### Observação
O backup automático gera um snapshot em JSON com dados de todos os usuários da coleção users do Firestore.

---

## 12. Fluxo administrativo

O app também tem:
- painel administrativo para usuários admin
- ativação/bloqueio de usuários
- controle de assinatura
- acesso a módulos fiscais, se habilitado

### Arquivos principais
- src/hooks/useAdminActions.ts
- src/hooks/useSubscriptionExpiryGuard.ts
- src/components/admin/AdminView.tsx

---

## 13. Principais views / telas do sistema

As telas principais são:
- dashboard
- returns
- clients
- pendencies
- appointments
- history
- warranties
- expenses
- cash-register
- products
- settings
- admin
- report
- fiscal
- checkout

Cada uma dessas telas é controlada pelo estado de visualização em App.tsx e pelo renderer AppViewRenderer.

---

## 14. Resumo em uma frase

O MotoFix é um sistema de gestão para oficina que registra clientes, serviços e manutenções como “ordens de serviço” em maintenances, atualiza o status de recorrência do cliente, controla pagamentos, agenda atendimentos, organiza garantias, despesas e configurações da oficina, tudo persistido por usuário no Firestore.

---

## 15. Caminhos mais importantes para entender rapidamente

Se for necessário entender o sistema rapidamente, comece por estes arquivos:

- src/App.tsx: ponto central da aplicação
- src/types.ts: estrutura dos principais modelos
- src/components/clients/ClientForm.tsx: formulário de cadastro/serviço
- src/hooks/useClientActions.ts: lógica principal de salvar cliente e serviço
- src/hooks/useMaintenanceActions.ts: lógica de manutenção/recorrência/pagamentos
- src/components/settings/SettingsView.tsx: configurações da oficina
- src/services/clientRepository.ts: persistência de clientes
- server/automaticBackup.ts: backup automático

---

## 16. Nota importante para quem for manter o sistema

O sistema ainda tem partes antigas e partes refatoradas. O fluxo principal já foi modularizado, mas o app ainda pode conter lógica antiga em App.tsx, especialmente em áreas de views e estado global.

Para entender o produto de forma prática, o ponto mais importante é este:
- cliente = pessoa/veículo
- manutenção = atendimento/ordem de serviço
- nextMaintenanceDate = base da recorrência
- settings/config = configuração operacional da oficina
