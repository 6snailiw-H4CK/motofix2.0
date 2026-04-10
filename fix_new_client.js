const fs = require('fs');
const path = require('path');

const filePath = path.join(__dirname, 'src', 'App.tsx');
const content = fs.readFileSync(filePath, 'utf-8');

// Encontrar o novo-client view
const startIdx = content.indexOf("{view === 'new-client' && (");
if (startIdx === -1) {
  console.log('ERROR: Não encontrou view new-client');
  process.exit(1);
}

// Procurar admin view
const adminIdx = content.indexOf("{view === 'admin' && userProfile?.role === 'admin' && (", startIdx);
if (adminIdx === -1) {
  console.log('ERROR: Não encontrou admin view');
  process.exit(1);
}

// Procurar o fechamento }); logo antes do admin
let closingIdx = content.lastIndexOf('})', startIdx, adminIdx);
if (closingIdx === -1) {
  console.log('ERROR: Não encontrou fechamento })');
  process.exit(1);
}
closingIdx += 2;

// Conteúdo antes e depois
const before = content.substring(0, startIdx);
const after = '\n          ' + content.substring(adminIdx);

// Componente novo
const newComponent = `{view === 'new-client' && (
            <NewClientForm
              editingClient={editingClient}
              maintenances={maintenances}
              isSaving={isSaving}
              onBack={() => { setEditingClient(null); setView('clients'); }}
              onSubmit={handleSaveClient}
              clients={clients}
            />
          )}`;

// Montar conteúdo final
const newContent = before + newComponent + after;

// Salvar arquivo
fs.writeFileSync(filePath, newContent, 'utf-8');

const romovoved = adminIdx - closingIdx;
console.log('✅ Arquivo App.tsx atualizado com sucesso!');
console.log(`   Removeu ${romovoved} caracteres de código antigo`);
console.log(`   De posição: ${closingIdx} até ${adminIdx}`);
