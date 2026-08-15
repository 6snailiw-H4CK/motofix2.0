const fs = require('fs');
const path = require('path');

const src = 'C:\\Users\\BOX\\Downloads\\Tabela_NCM_Vigente_20260820.json';
const dest = path.resolve(__dirname, '..', 'public', 'data', 'ncm.json');

try {
  fs.mkdirSync(path.dirname(dest), { recursive: true });
  const content = fs.readFileSync(src, 'utf8');
  fs.writeFileSync(dest, content, 'utf8');
  console.log('Copied NCM JSON to', dest);
} catch (err) {
  console.error('Failed copying NCM JSON:', err && err.message ? err.message : err);
  process.exit(1);
}
