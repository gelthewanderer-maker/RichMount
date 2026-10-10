import {writeFileSync} from 'node:fs';
const value=process.env.CLASSROOM_API_URL||process.env.RENDER_EXTERNAL_URL||process.env.CLASSROOM_APP_URL||'';
if(value){const url=new URL(value);if(!['https:','http:'].includes(url.protocol)||url.username||url.password||url.search||url.hash)throw new Error('Use the classroom service origin as CLASSROOM_API_URL');}
writeFileSync(new URL('../dist/classroom-config.js',import.meta.url),'export const CLASSROOM_API='+JSON.stringify(value.replace(/\/$/,''))+';\n');
