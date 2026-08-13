const fs = require('fs');
const path = 'src/components/settings/SettingsView.tsx';
const text = fs.readFileSync(path, 'utf8');
const lines = text.split('\n');
const tags = [];
const tagRegex = /<\s*(\/)?\s*([A-Za-z0-9_]+)([^>]*)>/g;
function isSelfClosing(attr, tag){ if(/\/$/.test(attr.trim())) return true; const self = ['input','img','br','hr','meta','link']; if(self.includes(tag)) return true; return false }
for(let i=0;i<lines.length;i++){
  const line = lines[i];
  let m;
  tagRegex.lastIndex = 0;
  while((m=tagRegex.exec(line))){
    const closing = !!m[1];
    const tag = m[2];
    const attr = m[3] || '';
    const col = m.index + 1;
    if(closing){
      const top = tags.pop();
      if(!top){
        console.log(`Line ${i+1}, col ${col}: unexpected closing </${tag}>`);
        process.exit(0);
      }
      if(top.tag !== tag){
        console.log(`Line ${i+1}, col ${col}: closing </${tag}> but top is <${top.tag}> opened at L${top.line}:${top.col}`);
        process.exit(0);
      }
    } else {
      if(isSelfClosing(attr, tag)){
        // ignore
      } else {
        tags.push({tag, line: i+1, col});
      }
    }
  }
}
if(tags.length===0) console.log('All tags balanced'); else console.log('Unclosed tags at EOF:', tags.slice(0,10));
