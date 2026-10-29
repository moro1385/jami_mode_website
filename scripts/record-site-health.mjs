// Explicit one-shot recording only. No scheduler or external notification destination.
import {renderHealthReport} from './lib/health-report.mjs';
import {checkSiteHealth,siteOrigin} from './lib/site-health.mjs';
import {healthHistoryPath,readHealthHistory,recordHealthHistory,healthHistoryReport} from './lib/health-history.mjs';
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--help')console.log('node scripts/record-site-health.mjs --state-file ABSOLUTE/jamimode-health-history.json [--report | --html | --origin https://jamimode.ir]');
else{
  try{
    if(args.length<2||args[0]!=='--state-file'||!(args.length===2||args.length===3&&['--report','--html'].includes(args[2])||args.length===4&&args[2]==='--origin'))throw Error();
    const file=await healthHistoryPath(args[1]);
    if(['--report','--html'].includes(args[2])){
      const history=await readHealthHistory(file);if(!history)throw Error();const report=healthHistoryReport(history);console.log(args[2]==='--html'?renderHealthReport(history):JSON.stringify({result:'report',localHistory:true,report}));if(report.stale)process.exitCode=1;
    }else{
      const origin=siteOrigin(args[3]),sample=await checkSiteHealth(origin),result=await recordHealthHistory(file,sample,{origin});
      console.log(JSON.stringify({result:sample.result,localHistory:true,...result}));if(sample.result!=='ok')process.exitCode=1;
    }
  }catch{console.log(JSON.stringify({result:'history_unavailable_or_invalid',localHistory:true}));process.exitCode=2;}
}
