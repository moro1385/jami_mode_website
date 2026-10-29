// @vitest-environment node
import {describe,expect,it} from 'vitest';
import {advanceHistory} from '../../scripts/lib/health-history.mjs';
import {renderHealthReport} from '../../scripts/lib/health-report.mjs';
const now=Date.parse('2026-10-27T12:00:00.000Z');
const sample={result:'ok',readOnly:true,checks:['live','maintenance','supabase'].map(name=>({name,ok:true,status:200,reason:'ok',durationMs:100}))};
describe('standalone Persian health report',()=>{
 it('renders safe health data with no scripts, external assets, forms, trackers or automatic refresh',()=>{
  const history=advanceHistory(null,sample,'https://jamimode.ir',now).history,html=renderHealthReport(history,now);
  expect(html).toContain('lang="fa" dir="rtl"');expect(html).toContain('آخرین نمونه تازه است');expect(html).toContain('default-src');expect(html).toContain('یک نقطهٔ بررسی');
  expect(html).not.toMatch(/<script|<link|<img|<form|http-equiv="refresh"|onload=/i);expect(html).not.toContain('access_token');
 });
 it('marks stale exports clearly and rejects injected or widened history',()=>{
  const history=advanceHistory(null,sample,'https://jamimode.ir',now).history;
  expect(renderHealthReport(history,now+300001)).toContain('این گزارش تازه نیست');expect(()=>renderHealthReport({...history,origin:'https://evil.invalid/<script>'},now)).toThrow();
 });
});
