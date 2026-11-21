import fs from 'node:fs';
const read=name=>fs.readFileSync(new URL(name,import.meta.url),'utf8');
const flatten=source=>source.replace(/^import\s+\{[\s\S]*?\}\s+from\s+['"][^'"]+['"];\s*/gm,'').replace(/^export /gm,'');
const script=[read('engine.js'),read('planning.js'),read('app.js')].map(flatten).join('\n');
const html=read('index-modular.html').replace('<link rel="stylesheet" href="./styles.css" />',`<style>\n${read('styles.css')}</style>`)
 .replace('<script type="module" src="./app.js"></script>',`<script>\n${script}</script>`);
fs.writeFileSync(new URL('index.html',import.meta.url),html);
