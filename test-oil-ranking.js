/**
 * Script de Testes - Gera dados de exemplo para testar o ranking de óleos
 * 
 * Modo de uso:
 * 1. Copie este código no console do navegador (F12)
 * 2. Certifique-se de estar autenticado no MotoFix
 * 3. Execute a função: generateTestOilData()
 * 
 * Isso vai criar:
 * - 15 clientes com diferentes tipos de óleo
 * - 30 manutenções com óleo especificado
 * - 5 garantias com óleo incluído
 */

async function generateTestOilData() {
  console.log("🛢️ Iniciando geração de dados de teste para ranking de óleos...");
  
  try {
    // Verificar autenticação
    if (!window.auth?.currentUser) {
      console.error("❌ Erro: Você não está autenticado! Faça login primeiro.");
      return;
    }
    
    const userId = window.auth.currentUser.uid;
    console.log(`✅ Autenticado como: ${window.auth.currentUser.email}`);
    
    // Opções de óleos para teste
    const oilTypes = [
      '10W30',
      '10W40',
      '20W50',
      'Motul 3000',
      'Motul 5000',
      'Yamalube',
      'Mobil 1',
      'Shell Helix'
    ];

    // Dados de teste para clientes
    const testClients = [
      { name: 'Carlos Silva', bikeModel: 'Honda CG 160', oilType: 'Motul 3000', oilPrice: 45 },
      { name: 'João Santos', bikeModel: 'Yamaha XTZ', oilType: '10W40', oilPrice: 35 },
      { name: 'Maria Oliveira', bikeModel: 'Honda CB 500', oilType: 'Motul 5000', oilPrice: 65 },
      { name: 'Pedro Souza', bikeModel: 'Suzuki Let\'s', oilType: '10W30', oilPrice: 30 },
      { name: 'Ana Costa', bikeModel: 'Kawasaki Ninja', oilType: 'Yamalube', oilPrice: 55 },
      { name: 'Lucas Ferreira', bikeModel: 'Honda CG 160', oilType: 'Motul 3000', oilPrice: 45 },
      { name: 'Fernanda Dias', bikeModel: 'Yamaha Factor', oilType: '10W40', oilPrice: 35 },
      { name: 'Roberto Alves', bikeModel: 'Honda CB 300', oilType: 'Shell Helix', oilPrice: 50 },
      { name: 'Camila Rocha', bikeModel: 'Suzuki GSX', oilType: 'Motul 5000', oilPrice: 65 },
      { name: 'Gustavo Lima', bikeModel: 'Yamaha XTZ', oilType: 'Mobil 1', oilPrice: 60 },
      { name: 'Beatriz Martins', bikeModel: 'Honda CG 160', oilType: '10W30', oilPrice: 30 },
      { name: 'Rafael Gomes', bikeModel: 'Kawasaki KLR', oilType: 'Yamalube', oilPrice: 55 },
      { name: 'Gabriela Costa', bikeModel: 'Honda CB 500', oilType: 'Motul 3000', oilPrice: 45 },
      { name: 'Marcelo Silva', bikeModel: 'Yamaha Factor', oilType: '10W40', oilPrice: 35 },
      { name: 'Juliana Pereira', bikeModel: 'Suzuki Address', oilType: 'Shell Helix', oilPrice: 50 }
    ];

    // Adicionar clientes
    console.log("👥 Adicionando clientes de teste...");
    const createdClients = [];
    
    for (const clientData of testClients) {
      const docRef = await window.db.collection('users').doc(userId).collection('clients').add({
        name: clientData.name,
        bikeModel: clientData.bikeModel,
        oilType: clientData.oilType,
        oilPrice: clientData.oilPrice,
        contact: '(69) 99999-9999',
        userId: userId,
        lastMaintenanceDate: new Date().toISOString(),
        nextMaintenanceDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString(),
        recurrenceDays: 30,
        status: 'OK',
        isRecurringRevenue: true,
        lastServiceType: 'Troca de Óleo',
        lastServiceValue: clientData.oilPrice,
        createdAt: new Date().toISOString()
      });
      
      createdClients.push({ id: docRef.id, ...clientData });
      console.log(`  ✅ Cliente criado: ${clientData.name}`);
    }

    // Adicionar manutenções com óleos
    console.log("🔧 Adicionando histórico de manutenções com óleos...");
    const serviceTypes = ['Troca de Óleo', 'Revisão', 'Revisão Completa'];
    const now = new Date();

    for (let i = 0; i < 30; i++) {
      const randomClient = createdClients[Math.floor(Math.random() * createdClients.length)];
      const randomService = serviceTypes[Math.floor(Math.random() * serviceTypes.length)];
      const daysAgo = Math.floor(Math.random() * 90); // Últimos 90 dias
      const maintenanceDate = new Date(now.getTime() - daysAgo * 24 * 60 * 60 * 1000).toISOString();

      await window.db.collection('users').doc(userId).collection('maintenances').add({
        clientId: randomClient.id,
        clientName: randomClient.name,
        bikeModel: randomClient.bikeModel,
        date: maintenanceDate,
        oilType: randomClient.oilType,
        oilPrice: randomClient.oilPrice,
        serviceType: randomService,
        serviceValue: randomClient.oilPrice,
        isRecurringRevenue: true,
        userId: userId,
        statusPagamento: 'Pago',
        valorPago: randomClient.oilPrice,
        saldoDevedor: 0,
        notes: `Serviço de teste - ${randomService}`
      });

      console.log(`  ✅ Manutenção #${i + 1}: ${randomClient.name} - ${randomClient.oilType}`);
    }

    // Adicionar garantias com óleo
    console.log("📋 Adicionando garantias de teste com óleo...");
    
    for (let i = 0; i < 5; i++) {
      const randomClient = createdClients[Math.floor(Math.random() * createdClients.length)];
      const warrantyNumber = Math.floor(Math.random() * 10000) + 1000;
      const serviceDate = new Date().toISOString();
      const expiryDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();

      await window.db.collection('users').doc(userId).collection('warranties').add({
        clientName: randomClient.name,
        serviceType: 'Troca de Óleo',
        serviceDescription: `Troca de óleo ${randomClient.oilType}`,
        serviceValue: randomClient.oilPrice,
        serviceDate: serviceDate,
        durationMonths: 12,
        expiryDate: expiryDate,
        clientPhone: '(69) 99999-9999',
        warrantyNumber: warrantyNumber,
        userId: userId,
        createdAt: new Date().toISOString(),
        oilType: randomClient.oilType
      });

      console.log(`  ✅ Garantia #${warrantyNumber}: ${randomClient.name} - ${randomClient.oilType}`);
    }

    console.log("✨ Dados de teste gerados com sucesso!");
    console.log("📊 Agora você pode visualizar o ranking de óleos no Dashboard");
    console.log("\n📍 Instruções:");
    console.log("1. Vá para o Dashboard");
    console.log("2. Procure pela seção '🛢️ Óleos Mais Vendidos'");
    console.log("3. Você verá um ranking dos óleos mais vendidos com contagem e receita total");

  } catch (error) {
    console.error("❌ Erro ao gerar dados de teste:", error);
    if (error.code === 'permission-denied') {
      console.error("Verifique suas permissões no Firestore");
    }
  }
}

// Função auxiliar para limpar os dados de teste
async function deleteTestOilData() {
  console.log("🗑️ Limpando dados de teste...");
  
  try {
    if (!window.auth?.currentUser) {
      console.error("❌ Você não está autenticado!");
      return;
    }
    
    const userId = window.auth.currentUser.uid;

    // Deletar clientes
    const clientsSnap = await window.db.collection('users').doc(userId).collection('clients').get();
    for (const doc of clientsSnap.docs) {
      await doc.ref.delete();
    }
    console.log(`✅ ${clientsSnap.size} clientes deletados`);

    // Deletar manutenções
    const maintenancesSnap = await window.db.collection('users').doc(userId).collection('maintenances').get();
    for (const doc of maintenancesSnap.docs) {
      await doc.ref.delete();
    }
    console.log(`✅ ${maintenancesSnap.size} manutenções deletadas`);

    // Deletar garantias
    const warrantiesSnap = await window.db.collection('users').doc(userId).collection('warranties').get();
    for (const doc of warrantiesSnap.docs) {
      await doc.ref.delete();
    }
    console.log(`✅ ${warrantiesSnap.size} garantias deletadas`);

    console.log("✨ Dados de teste removidos com sucesso!");

  } catch (error) {
    console.error("❌ Erro ao limpar dados:", error);
  }
}

// Instruções de uso
console.log(`
╔══════════════════════════════════════════════════════════════╗
║         🛢️  SCRIPT DE TESTE - RANKING DE ÓLEOS             ║
╚══════════════════════════════════════════════════════════════╝

Para gerar dados de teste:
  generateTestOilData()

Para limpar dados de teste:
  deleteTestOilData()

O script criará:
  ✅ 15 clientes com diferentes tipos de óleo
  ✅ 30 registros de manutenção com óleos
  ✅ 5 garantias com óleos incluídos
  ✅ Um ranking automático no Dashboard

Você poderá então:
  1. Ver o ranking dos óleos mais vendidos
  2. Verificar a contagem de vendas por óleo
  3. Visualizar a receita total por tipo de óleo
`);
