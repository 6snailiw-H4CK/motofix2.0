# Resumo estruturado para ingestão automática - MotoFix

Este arquivo consolida o funcionamento do sistema em formato de estrutura legível para IA, com foco em dados, fluxos, coleções, telas e regras de negócio.

---

## 1. Visão geral do sistema

```json
{
  "sistema": {
    "nome": "MotoFix",
    "tipo": "sistema web para gestão de oficina motociclista",
    "objetivoPrincipal": "centralizar clientes, serviços, recorrência, agenda, finanças, garantias, lembretes e configurações da oficina",
    "publicoAlvo": "oficinas de motos e prestadores de serviço automotivo",
    "stack": {
      "frontend": ["React 19", "TypeScript", "Vite", "Tailwind CSS"],
      "backend": ["Node.js", "Express"],
      "banco": ["Firebase Firestore"],
      "autenticacao": ["Firebase Auth"],
      "pagamentos": ["Stripe"],
      "graficos": ["Recharts"],
      "pdf": ["jsPDF", "html2canvas"]
    }
  }
}
```

---

## 2. Estrutura de dados principal

```json
{
  "estruturaFirestore": {
    "raiz": "users/{uid}",
    "colecoes": {
      "clients": "cadastro de clientes, motos, contato, recorrência, status e valores",
      "maintenances": "histórico de serviços e ordens de serviço",
      "warranties": "garantias",
      "appointments": "agenda/atendimentos",
      "expenses": "despesas da oficina",
      "products": "catálogo de produtos/mercadorias",
      "cash_launches": "lançamentos financeiros/caixa",
      "message_logs": "logs de WhatsApp/email",
      "settings": "configurações da oficina"
    },
    "caminhoConfiguracao": "users/{uid}/settings/config"
  }
}
```

---

## 3. Entidades principais

```json
{
  "entidades": {
    "Client": {
      "descricao": "representa um cliente da oficina",
      "camposPrincipais": [
        "id",
        "name",
        "fullName",
        "document",
        "bikeModel",
        "oilType",
        "oilPrice",
        "contact",
        "email",
        "vehiclePlate",
        "mileageKm",
        "lastMaintenanceDate",
        "nextMaintenanceDate",
        "recurrenceDays",
        "status",
        "isRecurringRevenue",
        "lastServiceType",
        "lastServiceValue",
        "lastServiceNotes",
        "statusPagamento",
        "valorPago",
        "saldoDevedor"
      ],
      "statusPossiveis": ["OK", "WARNING", "OVERDUE"]
    },
    "MaintenanceRecord": {
      "descricao": "representa uma manutenção ou ordem de serviço",
      "camposPrincipais": [
        "id",
        "clientId",
        "clientName",
        "bikeModel",
        "date",
        "oilType",
        "oilPrice",
        "serviceType",
        "serviceValue",
        "isRecurringRevenue",
        "notes",
        "statusPagamento",
        "valorPago",
        "saldoDevedor"
      ],
      "papel": "registro principal do atendimento e histórico de serviço"
    },
    "ExpenseRecord": {
      "descricao": "despesa da oficina",
      "camposPrincipais": [
        "description",
        "supplier",
        "amount",
        "paymentMethod",
        "date",
        "note"
      ]
    },
    "CashRegisterLaunch": {
      "descricao": "lançamento ou pedido do caixa/fiscal",
      "camposPrincipais": [
        "orderNumber",
        "clientName",
        "status",
        "openingDate",
        "expectedDate",
        "servicesExecuted",
        "observation",
        "items",
        "merchandiseTotal",
        "servicesTotal",
        "total",
        "statusPagamento",
        "valorPago",
        "saldoDevedor"
      ]
    },
    "Settings": {
      "descricao": "configurações da oficina",
      "camposPrincipais": [
        "businessName",
        "serviceTypes",
        "oilTypes",
        "warrantyCategories",
        "disabledDefaultServiceTypes"
      ]
    }
  }
}
```

---

## 4. Fluxo principal de cadastro de cliente/serviço

```json
{
  "fluxoClienteServico": {
    "entrada": "formulário de cadastro/serviço",
    "dadosColetados": [
      "nome do cliente",
      "telefone",
      "modelo da moto",
      "tipo de serviço",
      "data do atendimento",
      "valor",
      "status de pagamento",
      "observações"
    ],
    "persistencia": {
      "clients": "cria ou atualiza o cliente",
      "maintenances": "cria um registro de manutenção/ordem de serviço"
    },
    "atualizacoesNoCliente": [
      "lastMaintenanceDate",
      "nextMaintenanceDate",
      "status",
      "lastServiceType",
      "lastServiceValue",
      "lastServiceNotes",
      "statusPagamento",
      "valorPago",
      "saldoDevedor"
    ],
    "componentesPrincipais": {
      "form": "src/components/clients/ClientForm.tsx",
      "hook": "src/hooks/useClientActions.ts",
      "repositorio": "src/services/clientRepository.ts",
      "servicoEspecializado": "src/services/clientSaveService.ts"
    }
  }
}
```

---

## 5. Fluxo de troca de óleo

```json
{
  "fluxoTrocaDeOleo": {
    "descricao": "a troca de óleo é tratada como um tipo de serviço especial",
    "camposAssociados": [
      "oilType",
      "oilPrice"
    ],
    "persistencia": {
      "cliente": "armazenado no documento do cliente",
      "manutencao": "armazenado no documento da manutenção"
    },
    "impacto": "influencia a recorrência futura e o histórico do cliente",
    "arquivosPrincipais": [
      "src/lib/serviceTypes.ts",
      "src/components/clients/ClientForm.tsx",
      "src/hooks/useMaintenanceActions.ts"
    ]
  }
}
```

---

## 6. Fluxo de recorrência e retorno

```json
{
  "fluxoRecorrencia": {
    "objetivo": "identificar clientes que devem voltar para manutenção ou revisão",
    "base": "nextMaintenanceDate e recurrenceDays",
    "passo1": "um serviço é registrado",
    "passo2": "o sistema calcula a próxima data",
    "passo3": "o status do cliente é recalculado",
    "passo4": "o cliente entra em listas de retorno/recorrência",
    "status": {
      "OK": "em dia",
      "WARNING": "próximo do vencimento",
      "OVERDUE": "atrasado"
    },
    "arquivosPrincipais": [
      "src/hooks/useMaintenanceActions.ts",
      "src/hooks/useClientStatusSync.ts",
      "src/hooks/useWhatsAppReminderActions.ts",
      "src/components/returns/ReturnsView.tsx"
    ]
  }
}
```

---

## 7. Fluxo de ordens de serviço

```json
{
  "ordemDeServico": {
    "representacao": "não existe como coleção separada; é representada por maintenances",
    "conteudo": {
      "cliente": "clientId e clientName",
      "data": "date",
      "tipo": "serviceType",
      "valor": "serviceValue",
      "observacoes": "notes",
      "pagamento": "statusPagamento, valorPago, saldoDevedor"
    },
    "usoPrincipal": "histórico de atendimento e base para recorrência",
    "caminho": "users/{uid}/maintenances"
  }
}
```

---

## 8. Fluxo de agenda e solicitações

```json
{
  "fluxoAgenda": {
    "descricao": "suporte a agendamento e acompanhamento de compromissos",
    "colecao": "users/{uid}/appointments",
    "funcionalidades": [
      "criar agendamento",
      "listar compromissos",
      "concluir atendimento",
      "excluir agendamento"
    ],
    "arquivosPrincipais": [
      "src/components/appointments/AppointmentsView.tsx",
      "src/components/clients/ClientsScheduleView.tsx",
      "src/hooks/useAppointmentActions.ts"
    ]
  }
}
```

---

## 9. Fluxo financeiro e pendências

```json
{
  "fluxoFinanceiro": {
    "objetivo": "controlar recebimentos, dívidas, despesas e caixa",
    "colecoes": {
      "maintenances": "pagamentos e valores de serviços",
      "expenses": "despesas da oficina",
      "cash_launches": "lançamentos financeiros"
    },
    "statusPagamento": ["Pago", "Pendente", "Parcial"],
    "regras": [
      "saldo devedor é calculado automaticamente",
      "uma manutenção pode ter valor pago parcial",
      "o dashboard usa esses dados para métricas financeiras"
    ],
    "arquivosPrincipais": [
      "src/hooks/useMaintenanceActions.ts",
      "src/components/expenses/ExpensesView.tsx",
      "src/components/dashboard/DashboardView.tsx"
    ]
  }
}
```

---

## 10. Fluxo de configurações da oficina

```json
{
  "fluxoConfiguracoes": {
    "colecao": "users/{uid}/settings/config",
    "objetivo": "centralizar opções operacionais da oficina",
    "dadosExemplos": [
      "businessName",
      "serviceTypes",
      "oilTypes",
      "warrantyCategories",
      "disabledDefaultServiceTypes"
    ],
    "componentes": [
      "src/components/settings/SettingsView.tsx",
      "src/hooks/useSettingsActions.ts"
    ]
  }
}
```

---

## 11. Fluxo de backup, restauração e offline

```json
{
  "fluxoBackup": {
    "backupAutomatico": "gerado por server/automaticBackup.ts",
    "formato": "JSON",
    "destino": "backups/automatic",
    "objetivo": "criar snapshot diário dos dados do usuário/Firestore",
    "offline": "há fila de escrita e sincronização quando a conexão cai",
    "arquivosPrincipais": [
      "server/automaticBackup.ts",
      "server/backupRoutes.ts",
      "src/services/firestoreOfflineQueue.ts",
      "src/hooks/useOfflineSyncStatus.ts"
    ]
  }
}
```

---

## 12. Fluxo administrativo e assinatura

```json
{
  "fluxoAdmin": {
    "funcionalidades": [
      "ativar ou bloquear usuários",
      "ajustar assinatura",
      "controlar acesso a módulos",
      "monitorar usuários"
    ],
    "arquivosPrincipais": [
      "src/hooks/useAdminActions.ts",
      "src/hooks/useSubscriptionExpiryGuard.ts",
      "src/components/admin/AdminView.tsx"
    ]
  }
}
```

---

## 13. Telas principais

```json
{
  "telasPrincipais": [
    "dashboard",
    "returns",
    "clients",
    "pendencies",
    "appointments",
    "history",
    "warranties",
    "expenses",
    "cash-register",
    "products",
    "settings",
    "admin",
    "report",
    "fiscal",
    "checkout"
  ]
}
```

---

## 14. Regras de negócio críticas

```json
{
  "regrasCriticas": [
    "cada usuário tem seu próprio espaço no Firestore",
    "o cliente e a manutenção são persistidos separadamente, mas ligados por clientId",
    "a próxima manutenção é calculada com base em recurrenceDays",
    "o status do cliente é derivado da próxima data",
    "a ordem de serviço é representada por maintenances",
    "pagamentos podem ser pagos, pendentes ou parciais",
    "configurações da oficina influenciam o comportamento do formulário e do fluxo operacional"
  ]
}
```

---

## 15. Resumo executivo final

```json
{
  "resumoFinal": {
    "frase": "O MotoFix é um sistema de gestão para oficina que registra clientes e serviços como manutenções/ordens de serviço, calcula recorrência, controla pagamentos, agenda atendimentos, organiza garantias, despesas e configurações, tudo persistido por usuário no Firestore.",
    "pontoCentral": "cliente = cadastro do relacionamento; manutenção = ordem de serviço; nextMaintenanceDate = base da recorrência; settings/config = configuração operacional"
  }
}
```
