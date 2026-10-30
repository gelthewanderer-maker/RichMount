// Restore only two checksum-pinned private JSON datasets during the build.
// No source code is loaded or executed from deployment settings.
import {existsSync,readFileSync,writeFileSync,mkdirSync} from 'node:fs';
import {dirname} from 'node:path';
import {createHash} from 'node:crypto';
import {inflateRawSync} from 'node:zlib';
const files=[{"path": "course/catalog.json", "prefix": "RICHMOUNT_COURSE_UPDATE", "max": 2000000, "sha256": "e2f56e0359a59c6b3ae632574048711a7c5d749a2f77debfbc001208cf69764e"}, {"path": "materials/book-activities.json", "prefix": "RICHMOUNT_BOOK_UPDATE", "max": 8000000, "sha256": "99b4d7e0bb2c4f1b6a15e8c35c374d2af974ad076d7076346fbbce70733910e8"}];
const hash=value=>createHash('sha256').update(value).digest('hex');
for(const file of files){
 if(existsSync(file.path)){if(hash(readFileSync(file.path))!==file.sha256)throw Error('Review updated private data: '+file.path);continue;}
 const count=Number(process.env[file.prefix+'_COUNT']||0);if(!Number.isInteger(count)||count<1||count>60)throw Error('Private lesson data is not configured: '+file.path);
 let packed='';for(let i=1;i<=count;i++){const part=process.env[file.prefix+'_'+i];if(!part||part.length>32768||!/^[A-Za-z0-9+/=]+$/.test(part))throw Error('Invalid private lesson data transport');packed+=part;}
 const bundle=JSON.parse(inflateRawSync(Buffer.from(packed,'base64'),{maxOutputLength:file.max}).toString('utf8'));
 const record=bundle.files?.find(record=>record.target===file.path);
 if(!record||typeof record.content!=='string'||hash(record.content)!==file.sha256)throw Error('Private lesson data checksum differs: '+file.path);
 JSON.parse(record.content);mkdirSync(dirname(file.path),{recursive:true});writeFileSync(file.path,record.content);
}
