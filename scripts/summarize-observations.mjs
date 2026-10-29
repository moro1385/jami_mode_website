// Summarize a supplied local log export; never print or copy source log lines.
import {createReadStream} from 'node:fs';
import {summarizeObservations} from './lib/observation-summary.mjs';
const args=process.argv.slice(2);
if(args.length===1&&args[0]==='--help')console.log('node scripts/summarize-observations.mjs [--file PATH] (otherwise reads stdin; max 8 MiB)');
else{
  try{if(args.length!==0&&(args.length!==2||args[0]!=='--file'||!args[1]))throw Error();const input=args.length?createReadStream(args[1]):process.stdin;const result=await summarizeObservations(input);console.log(JSON.stringify(result));}
  catch{console.log(JSON.stringify({result:'input_unavailable_or_invalid',readOnly:true}));process.exitCode=2;}
}
