# 🛢️ Guia de Testes - Ranking de Óleos

## ✨ O que foi implementado

### 1. **Seletor de Óleo no Formulário de Garantias**
- Campo novo no WarrantyForm.tsx
- Dropdown com opções de óleos da configuração
- Salva o óleo selecionado no banco de dados

### 2. **Ranking de Óleos no Dashboard**
- Seção "🛢️ Óleos Mais Vendidos" exibida na Dashboard
- Mostra top 5 óleos ordenados por quantidade de vendas
- Inclui receita total por óleo
- Atualiza em tempo real conforme novas manutenções são adicionadas

### 3. **Componente Reutilizável OilSelector**
- Novo componente em `src/components/OilSelector.tsx`
- Pode ser reutilizado em qualquer formulário
- Suporta customização de label e opções

### 4. **Atualização de Tipos**
- Interface `Warranty` agora inclui campo `oilType?: string`
- Compatível com dados existentes

---

## 🧪 Como Testar Antes do Deploy

### **Opção 1: Teste Automatizado com Dados de Exemplo** (Recomendado)

#### Passo 1: Gerar dados de teste
1. Abra o navegador e vá para seu app MotoFix
2. Faça login na sua conta
3. Pressione **F12** para abrir o Console do Desenvolvedor
4. Cole o código do arquivo `test-oil-ranking.js` na aba Console
5. Execute o comando:
   ```javascript
   generateTestOilData()
   ```
6. Aguarde a conclusão (leva ~10 segundos)

#### Passo 2: Verificar o ranking
1. Vá para o **Dashboard**
2. Procure pela seção **"🛢️ Óleos Mais Vendidos"**
3. Você verá um ranking com:
   - Posição (#1, #2, #3...)
   - Nome do óleo
   - Quantidade de vendas
   - Receita total

#### Passo 3: Verificar a nova funcionalidade
1. Vá para **Garantias** → **Nova Garantia**
2. Preencha os campos normalmente
3. **Novidade**: Procure pelo campo **"Tipo de Óleo"** (com ícone de gota)
4. Selecione um óleo da lista
5. Clique em "Registrar Garantia"
6. Volte ao Dashboard - o ranking será atualizado

#### Passo 4: Limpar dados de teste (opcional)
```javascript
deleteTestOilData()
```

---

### **Opção 2: Teste Manual com Dados Reais**

Se preferir testar com dados que você vai realmente usar:

1. **Adicione um novo cliente:**
   - Vá em **Clientes** → **Novo Registro**
   - Preencha nome, modelo, WhatsApp
   - No campo **"Tipo de Óleo"**, escolha um óleo
   - Salve o cliente

2. **Crie uma garantia:**
   - Vá em **Garantias** → **Nova Garantia**
   - Preencha os dados
   - **Novidade**: Escolha o tipo de óleo
   - Salve a garantia

3. **Registre uma manutenção:**
   - Vá em **Histórico de Serviços**
   - Os serviços já devem ter o óleo do cliente
   - O Dashboard será atualizado automaticamente

4. **Visualize o ranking:**
   - Vá para **Dashboard**
   - Procure por **"🛢️ Óleos Mais Vendidos"**
   - Veja quantas vendas e receita por óleo

---

## 📊 Exemplos de Casos de Teste

### Caso 1: Ranking com Múltiplos Óleos
- **Esperado**: Mostrar top 5 óleos mais vendidos
- **Teste**: Gere dados e verifique se todos os óleos aparecem ordenados por quantidade

### Caso 2: Atualização em Tempo Real
- **Esperado**: Adicionar uma nova manutenção deve atualizar o ranking imediatamente
- **Teste**: Registre uma garantia nova e veja o ranking mudar

### Caso 3: Óleo com Maior Receita
- **Esperado**: Mostrar receita total por óleo (pode ter óleo com menos vendas mas maior valor)
- **Teste**: Observe que o ranking ordena por QUANTIDADE, não por receita

### Caso 4: Sem Dados de Óleo
- **Esperado**: Não mostrar ranking de óleos se não houver dados
- **Teste**: Com dados vazios, a seção não deve aparecer

---

## 🔍 Verificação de Dados

Para verificar se os dados foram salvos corretamente no Firestore:

1. Abra o **Firebase Console**
2. Vá para **Firestore**
3. Navegue até: `users` → seu-uid → `maintenances`
4. Procure pelo campo `oilType` - deve estar preenchido

---

## ⚠️ Possíveis Problemas e Soluções

### Problema: O ranking não aparece no Dashboard
**Solução:**
- Certifique-se de que você executou `generateTestOilData()` com sucesso
- Recarge a página (F5)
- Verifique o console (F12) para mensagens de erro

### Problema: O campo de óleo não aparece na garantia
**Solução:**
- Verifique se o arquivo `OilSelector.tsx` existe em `src/components/`
- Verifique se o import está correto em `WarrantyForm.tsx`
- Recarge o navegador

### Problema: Ranking mostra número errado de vendas
**Solução:**
- O script inclui clientes registrados mesmo sem manutenção (peso 0.5)
- Isso é intencional para mostrar potencial de vendas
- Manutenções registradas têm peso 1.0

---

## 🚀 Próximos Passos para Deploy

### Antes de fazer deploy:

✅ **Checklist:**
- [ ] Testou o comando `generateTestOilData()` com sucesso
- [ ] Viu o ranking aparecer no Dashboard
- [ ] Adicionou uma nova garantia com óleo
- [ ] O ranking foi atualizado após adicionar nova manutenção
- [ ] Limpou os dados de teste com `deleteTestOilData()`
- [ ] Testou com dados reais da sua oficina
- [ ] Não há erros no console (F12)

### Deploy seguro:

1. **Branch de teste**: Faça o deploy em uma branch de teste primeiro
2. **Verificação**: Acesse a versão de teste e repita os testes
3. **Feedback**: Colete feedback dos usuários
4. **Deploy final**: Faça merge na branch principal

---

## 📱 Compatibilidade

✅ **Desktop** - Funciona perfeitamente
✅ **Tablet** - Responsivo
✅ **Mobile** - Adaptado para telas pequenas

---

## 💡 Dicas

- O ranking recalcula automaticamente em tempo real
- Dados históricos são incluídos (últimas manutenções)
- O componente OilSelector é reutilizável - pode ser adicionado a outros formulários
- A receita mostrada é a **valorPago** (dinheiro efetivamente recebido)

---

## 📞 Suporte

Se encontrar problemas:
1. Verifique o console (F12) para erros
2. Limpe os dados com `deleteTestOilData()`
3. Recomece o teste

---

**Pronto para testar?** 🚀

Execute: `generateTestOilData()`
