// Read-only bounded checks; no credentials, login, writes or recursive crawling.
import {checkSiteSeo} from './lib/site-seo.mjs';
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--help')console.log('node scripts/check-site-seo.mjs [https://jamimode.ir]');
else try{if(args.length>1)throw Error();const result=await checkSiteSeo(args[0]);console.log(JSON.stringify(result));process.exitCode=result.result==='ok'?0:1;}catch{console.log(JSON.stringify({result:'invalid_input',readOnly:true}));process.exitCode=2;}
