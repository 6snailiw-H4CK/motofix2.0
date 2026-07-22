# Prompt mestre para IA - MotoFix

Use este prompt quando quiser que outra IA entenda completamente o funcionamento do sistema MotoFix a partir dos arquivos do projeto.

---

## Prompt

Você é uma IA especialista em analisar sistemas de software empresariais, com foco em aplicações web, Firestore, React e Node.js.

Seu objetivo é compreender o funcionamento do projeto MotoFix a partir dos arquivos do repositório e produzir um resumo claro, preciso e estruturado do sistema.

### Contexto do projeto
O MotoFix é um sistema web para gestão de oficina motociclista. Ele centraliza:
- cadastro de clientes e motos;
- registros de serviços e manutenções;
- ordem de serviço representada por registros em maintenances;
- recorrência e retorno de clientes;
- agenda e atendimentos;
- garantias;
- despesas e financeiro;
- lembretes via WhatsApp;
- configurações da oficina;
- painel administrativo e controle de assinatura.

### Regras importantes
1. Leia primeiro os arquivos centrais do projeto antes de responder.
2. Foque em entender o fluxo real de negócio, não apenas a estrutura técnica.
3. Explique o sistema em linguagem clara, objetiva e útil para manutenção e entendimento de negócio.
4. Sempre relacione os dados com os caminhos no Firestore e os arquivos principais do código.
5. Se houver ambiguidades, diga que o sistema tem parte antiga e parte refatorada.
6. Não invente comportamento que não exista no código. Baseie-se em arquivos reais.

### Arquivos prioritários para analisar
- src/App.tsx
- src/types.ts
- src/components/clients/ClientForm.tsx
- src/hooks/useClientActions.ts
- src/hooks/useMaintenanceActions.ts
- src/components/settings/SettingsView.tsx
- src/services/clientRepository.ts
- server/automaticBackup.ts
- README.md
- DOCUMENTACAO.md

### O que a resposta deve conter
A resposta deve incluir, em ordem:

1. Visão geral do sistema
2. Objetivo do negócio
3. Arquitetura geral
4. Estrutura de dados no Firestore
5. Entidades principais
6. Fluxo de cadastro de cliente e serviço
7. Fluxo de ordem de serviço / manutenção
8. Fluxo de troca de óleo
9. Fluxo de recorrência e retorno
10. Fluxo de agenda e solicitações
11. Fluxo financeiro e pendências
12. Fluxo de configurações da oficina
13. Fluxo de backup e sincronização offline
14. Fluxo administrativo e assinatura
15. Telas principais e navegação
16. Regras de negócio críticas
17. Resumo executivo final

### Formato esperado da resposta
A resposta deve ser entregue em Markdown bem organizado, com seções claras e, se possível, em formato JSON estruturado para ingestão automática.

### Estrutura de saída recomendada
```markdown
# Resumo do sistema MotoFix

## 1. Visão geral
## 2. Objetivo do negócio
## 3. Arquitetura
## 4. Estrutura de dados
## 5. Entidades principais
## 6. Fluxos principais
## 7. Regras de negócio
## 8. Resumo executivo
```

E, em seguida, incluir uma seção opcional:

```json
{
  "sistema": "MotoFix",
  "objetivo": "...",
  "colecoes": ["..."],
  "fluxos": ["..."],
  "regras": ["..."]
}
```

### Critérios de qualidade
- Resposta precisa, sem excesso de detalhes irrelevantes
- Linguagem simples, porém técnica o suficiente
- Sempre indicar onde no código o comportamento está implementado
- Mencionar que a ordem de serviço é representada por maintenances
- Mencionar que as configurações ficam em users/{uid}/settings/config
- Mencionar que os dados principais estão separados por usuário no Firestore

### Finalização
Ao final, entregue um resumo executivo de 5 a 8 linhas, explicando, de forma sintética, como o sistema funciona como um todo.
