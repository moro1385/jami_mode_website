// @vitest-environment node
import {describe,expect,it} from 'vitest';
import {Readable} from 'node:stream';
import {summarizeObservations} from '../../scripts/lib/observation-summary.mjs';
const record={event:'http_request',requestId:'00000000-0000-4000-8000-000000000001',family:'storage',method:'GET',status:504,durationMs:30000,outcome:'server_error'};
const stream=(values:unknown[])=>Readable.from(values.map(v=>JSON.stringify(v)+'\n'));
describe('private local observation summaries',()=>{
 it('counts failures, slowness, aborts, suppression and maintenance without returning raw records or identifiers',async()=>{
  const result=await summarizeObservations(stream([record,{...record,family:'data',status:200,outcome:'slow',durationMs:2500},{...record,family:'auth',status:null,outcome:'aborted'}, {event:'http_observation_suppressed',count:5},{event:'maintenance_health',state:'stale'},{event:'ui_render_failed'}]));
  expect(result).toMatchObject({observedRequests:3,outcomes:{server_error:1,slow:1,aborted:1},families:{storage:1,data:1,auth:1},maxObservedDurationMs:30000,suppressed:5,uiRenderFailures:1,maintenanceStates:{stale:1},incomplete:true});expect(JSON.stringify(result)).not.toContain(record.requestId);
 });
 it('accepts a timestamp prefix, CRLF, fragmented chunks and an unterminated final line',async()=>{
  const raw='2026-10-27T12:00:00Z [app] '+JSON.stringify(record)+'\r\n'+JSON.stringify({event:'maintenance_health',state:'healthy'});const result=await summarizeObservations(Readable.from([raw.slice(0,23),raw.slice(23,90),raw.slice(90)]));expect(result.observedRequests).toBe(1);expect(result.maintenanceStates.healthy).toBe(1);expect(result.incomplete).toBe(false);
 });
 it.each([
  {...record,requestId:'private phone'}, {...record,family:'customer/secret'}, {...record,status:200}, {...record,durationMs:-1}, {...record,durationMs:Infinity}, {...record,password:'never-print'},
  {event:'http_observation_suppressed',count:-1},{event:'ui_render_failed',message:'never-print'},{event:'maintenance_health',state:'never-print'},
 ])('rejects malformed or widened records without echoing their contents %#',async value=>{const result=await summarizeObservations(stream([value]));expect(result.invalidRecords).toBe(1);expect(result.observedRequests).toBe(0);expect(JSON.stringify(result)).not.toMatch(/never-print|private phone|customer\/secret/);});
 it('ignores unrelated log content without printing it or calling it a complete sample',async()=>{
  const result=await summarizeObservations(Readable.from(['raw-private-password\n','{"event":"unrelated","token":"never-print"}\n','x'.repeat(16385)+'\n']));expect(result.ignoredLines).toBe(3);expect(result.incomplete).toBe(true);expect(JSON.stringify(result)).not.toMatch(/raw-private|never-print/);
 });
 it('bounds input bytes and input line count',async()=>{
  await expect(summarizeObservations(Readable.from(['12345']),{maxBytes:4})).rejects.toThrow();
  await expect(summarizeObservations(stream([record,record]),{maxLines:1})).rejects.toThrow();
 });
 it('does not invent availability, success rate or financial settlement from a partial log',async()=>{
  const result=await summarizeObservations(stream([]));expect(result.observedRequests).toBe(0);expect(result).not.toHaveProperty('successRate');expect(result).not.toHaveProperty('paymentsSettled');
 });
 it('does not overflow the suppression counter',async()=>{
  const result=await summarizeObservations(stream([{event:'http_observation_suppressed',count:Number.MAX_SAFE_INTEGER},{event:'http_observation_suppressed',count:1}]));expect(result.suppressed).toBe(Number.MAX_SAFE_INTEGER);expect(result.invalidRecords).toBe(1);
 });
});
