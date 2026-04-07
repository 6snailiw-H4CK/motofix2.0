# MotoFix - Sistema de Gerenciamento de Manutenção de Motos

MotoFix é uma aplicação full-stack moderna desenvolvida para oficinas mecânicas e centros automotivos especializados em motocicletas. O sistema foca na gestão de serviços recorrentes (como troca de óleo), controle de garantias e fidelização de clientes através de lembretes via WhatsApp.

## 🚀 Funcionalidades Principais

### 1. Dashboard Inteligente
- **Visão Geral:** Acompanhamento em tempo real de faturamento mensal e total.
- **Status de Manutenção:** Indicadores visuais para serviços em dia (OK), próximos ao vencimento (Atenção) e atrasados (Atrasado).
- **Gráficos de Desempenho:** Visualização mensal de serviços realizados e faturamento através de gráficos interativos (Recharts).

### 2. Gestão de Clientes e Serviços
- **Registro de Serviços:** Cadastro detalhado incluindo modelo da moto, tipo de óleo, valor do serviço e data da manutenção.
- **Recorrência Automática:** Cálculo automático da próxima manutenção com base nos dias de recorrência definidos (padrão 29 dias).
- **Histórico Completo:** Registro de todas as manutenções realizadas por cliente.

### 3. Sistema de Garantias
- **Emissão de Certificados:** Geração de certificados de garantia para serviços realizados.
- **Exportação para PDF:** Download de certificados em formato PDF prontos para impressão ou envio digital (jsPDF + html2canvas).
- **Categorias Personalizáveis:** Configuração de diferentes tipos de garantia nas configurações do sistema.

### 4. Lembretes via WhatsApp
- **Integração Direta:** Botão para abrir conversa no WhatsApp com mensagem pré-configurada.
- **Templates Dinâmicos:** Personalização da mensagem de lembrete usando tags como `{client}`, `{bike}` e `{date}`.
- **Logs de Mensagens:** Registro de quando o link do WhatsApp foi aberto para controle interno.

### 5. Painel Administrativo (RBAC)
- **Controle de Acesso:** Diferenciação entre usuários comuns e administradores.
- **Gestão de Usuários:** Ativação/Bloqueio de contas e gerenciamento de períodos de assinatura/expiração.

## 🛠️ Tecnologias Utilizadas

- **Frontend:** React 19, TypeScript, Tailwind CSS 4.
- **Backend:** Node.js com Express (Full-stack via Vite middleware).
- **Banco de Dados & Auth:** Firebase (Firestore e Firebase Authentication).
- **Animações:** Motion (framer-motion).
- **Gráficos:** Recharts.
- **Relatórios:** jsPDF e html2canvas.
- **Ícones:** Lucide React.

## 📋 Pré-requisitos e Configuração

### Variáveis de Ambiente
O projeto utiliza o Firebase como backend. As configurações devem estar no arquivo `firebase-applet-config.json` na raiz do projeto:

```json
{
  "apiKey": "SUA_API_KEY",
  "authDomain": "SEU_AUTH_DOMAIN",
  "projectId": "SEU_PROJECT_ID",
  "appId": "SEU_APP_ID",
  "firestoreDatabaseId": "SEU_DATABASE_ID"
}
```

### Instalação

1. Instale as dependências:
   ```bash
   npm install
   ```

2. Inicie o servidor de desenvolvimento:
   ```bash
   npm run dev
   ```

3. Para build de produção:
   ```bash
   npm run build
   ```

## 🔐 Segurança (Firestore Rules)

O sistema implementa regras de segurança rigorosas no Firestore:
- **Isolamento de Dados:** Usuários só podem ler e escrever seus próprios dados (`userId`).
- **Proteção de Admin:** Apenas administradores autenticados e validados por e-mail podem gerenciar a coleção de usuários globais.
- **Validação de Schema:** Todas as entradas são validadas por tipo e tamanho para evitar corrupção de dados.

## 📄 Licença

Este projeto é de uso exclusivo para fins de gerenciamento interno da MotoFix.
SPDX-License-Identifier: Apache-2.0
