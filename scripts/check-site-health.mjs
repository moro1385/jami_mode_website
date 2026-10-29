// One read-only check. No scheduling, credentials, login or external notifications.
import {checkSiteHealth} from './lib/site-health.mjs';
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--help')console.log('node scripts/check-site-health.mjs [https://jamimode.ir]');
else{
  try{if(args.length>1)throw Error();const result=await checkSiteHealth(args[0]);console.log(JSON.stringify(result));if(result.result!=='ok')process.exitCode=1;}
  catch{console.log(JSON.stringify({result:'invalid_input',readOnly:true}));process.exitCode=2;}
}
