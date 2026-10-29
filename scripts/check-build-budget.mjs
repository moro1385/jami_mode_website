import {readFile} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';
import {inspectBuildBudget} from './lib/build-budget.mjs';
const root=fileURLToPath(new URL('../',import.meta.url)),dist=path.join(root,'dist');
try{
 const [manifest,html,limits]=await Promise.all([readFile(path.join(dist,'.vite/manifest.json'),'utf8').then(JSON.parse),readFile(path.join(dist,'index.html'),'utf8'),readFile(path.join(root,'config/build-budget.json'),'utf8').then(JSON.parse)]);
 const result=await inspectBuildBudget({manifest,html,limits,read:file=>readFile(path.join(dist,file))});
 console.log(JSON.stringify(result));process.exitCode=result.result==='ok'?0:1;
}catch{console.error(JSON.stringify({result:'unavailable',reason:'build_or_budget_invalid'}));process.exitCode=2;}
