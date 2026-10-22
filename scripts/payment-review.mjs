// Trusted server only. No .env loading, provider access, uploads or retries.
import {open,realpath} from 'node:fs/promises';
import {dirname,resolve,relative,isAbsolute} from 'node:path';
import {fileURLToPath} from 'node:url';
import {createClient} from '@supabase/supabase-js';
import {reviewOptions,reviewManifest,reviewConfig,reviewFetch,runPaymentReview} from '../server/payment-review.js';
const root=await realpath(resolve(dirname(fileURLToPath(import.meta.url)),'..'));
async function privateFile(path,limit){
 const resolved=await realpath(path),within=relative(root,resolved);
 if(!within||(!within.startsWith('..')&&!isAbsolute(within)))throw new Error('Review files must remain outside the repository');
 const handle=await open(resolved,'r');
 try{
  const meta=await handle.stat();if(!meta.isFile()||meta.size<1||meta.size>limit)throw new Error('Invalid review file');
  const bytes=Buffer.alloc(limit+1);let used=0;
  while(used<bytes.length){const result=await handle.read(bytes,used,bytes.length-used,null);if(!result.bytesRead)break;used+=result.bytesRead;}
  if(used<1||used>limit)throw new Error('Invalid review file size');return bytes.subarray(0,used);
 }finally{await handle.close();}
}
if(process.argv.length===3&&process.argv[2]==='--help'){
 console.log('Usage: node scripts/payment-review.mjs <plan|apply> --project-ref <ref> --manifest <outside-repo.json> --evidence <outside-repo-file> [--execute --confirm-provider-review]');
 console.log('Trusted server only. Apply requires both flags and an independently reviewed provider portal/support artifact. No provider calls or retries.');
}else try{
 const options=reviewOptions(process.argv.slice(2));
 const config=reviewConfig(options,process.env);
 const manifest=JSON.parse((await privateFile(options.manifest,16384)).toString('utf8'));
 const args=reviewManifest(manifest,options,await privateFile(options.evidence,2*1024*1024));
 const client=createClient(config.url,config.key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false},global:{fetch:reviewFetch(config.url)}});
 console.log(JSON.stringify(await runPaymentReview(options,args,client)));
}catch{console.error('Payment review unavailable. No automatic retry; inspect the case before another attempt.');process.exitCode=1;}
