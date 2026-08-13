const ts = require('typescript');
const fs = require('fs');
const file = 'src/components/settings/SettingsView.tsx';
const text = fs.readFileSync(file, 'utf8');
const sourceFile = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true, ts.ScriptKind.TSX);
const diagnostics = sourceFile.parseDiagnostics || [];
if(diagnostics.length===0){
  console.log('No parse diagnostics from TypeScript TSX parser.');
} else {
  for(const d of diagnostics){
    const {line, character} = sourceFile.getLineAndCharacterOfPosition(d.start || 0);
    console.log(`Parse error: ${d.messageText} at ${line+1}:${character+1}`);
  }
}
