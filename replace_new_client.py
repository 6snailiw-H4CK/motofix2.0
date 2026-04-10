#!/usr/bin/env python3
# Script para substituir o novo-client view pelo component

with open('src/App.tsx', 'r', encoding='utf-8') as f:
    content = f.read()

# Código novo
new_code = """          {view === 'new-client' && (
            <NewClientForm
              editingClient={editingClient}
              maintenances={maintenances}
              isSaving={isSaving}
              onBack={() => { setEditingClient(null); setView('clients'); }}
              onSubmit={handleSaveClient}
              clients={clients}
            />
          )}"""

# Procurar  dentro do arquivo
start_marker = "{view === 'new-client' && ("
end_marker = "          )}\n          {view === 'admin' && userProfile?.role === 'admin' && ("

start_idx = content.find(start_marker)
if start_idx == -1:
    print(f"❌ Não encontrou start marker: {start_marker}")
    exit(1)

# Procurar entre onde a seção termina (antes de admin)
second_view_start = content.find("{view === 'admin' && userProfile?.role === 'admin' && (", start_idx)
if second_view_start == -1:
    print(f"❌ Não encontrou admin view")
    exit(1)

# Encontrar o fechamento da new-client (})  antes do admin view
end_search_start = start_idx + len(start_marker)
closing_brace = content.rfind("})", end_search_start, second_view_start)
if closing_brace == -1 or closing_brace + 2 > second_view_start:
    print(f"❌ Marcadores de fechamento não encontrados corretos")
    print(f"Start: {start_idx}, Admin view: {second_view_start}")
    # Mostrar uma amostra
    sample = content[start_idx:second_view_start][:500]
    print(f"Sample: {sample}")
    exit(1)

end_idx = closing_brace + 2

# Código a remover
old_code = content[start_idx:end_idx]

print(f"✅ Encontrado bloco old code:")
print(f"   - Posiçao: {start_idx} a {end_idx}")
print(f"   - Tamanaho: {len(old_code)} caracteres")
print(f"   - Primeiros 100 chars: {old_code[:100]}")
print(f"   - Últimos 100 chars: {old_code[-100:]}")

# Fazer a substituição
new_content = content[:start_idx] + new_code + content[end_idx:]

# Salvar
with open('src/App.tsx', 'w', encoding='utf-8') as f:
    f.write(new_content)

print("✅ Arquivo App.tsx atualizado com sucesso!")
