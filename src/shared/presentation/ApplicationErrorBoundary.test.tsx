import {afterEach,describe,expect,it,vi} from 'vitest';
import {cleanup,render,screen} from '@testing-library/react';
import {ApplicationErrorBoundary} from './ApplicationErrorBoundary';
afterEach(()=>{cleanup();vi.restoreAllMocks();localStorage.removeItem('phase6-synthetic-cart');});
describe('application render fallback',()=>{
 it('leaves healthy content unchanged',()=>{render(<ApplicationErrorBoundary><p>healthy child</p></ApplicationErrorBoundary>);expect(screen.getByText('healthy child')).toBeTruthy();expect(screen.queryByRole('alert')).toBeNull();});
 it('shows a safe Persian fallback and payment guidance without exposing the exception or deleting saved state',()=>{
  const error=vi.spyOn(console,'error').mockImplementation(()=>{});localStorage.setItem('phase6-synthetic-cart','preserved');
  function Broken():never{throw Error('private-customer-token-and-payload');}
  const preventSyntheticError=(event:ErrorEvent)=>{if(event.error?.message==='private-customer-token-and-payload')event.preventDefault();};
  window.addEventListener('error',preventSyntheticError);
  try{render(<ApplicationErrorBoundary><Broken /></ApplicationErrorBoundary>);}
  finally{window.removeEventListener('error',preventSyntheticError);}
  expect(screen.getByRole('alert').textContent).not.toContain('private-customer');
  expect(screen.getByRole('heading').textContent).toContain('نمایش صفحه');expect(screen.getByRole('button').textContent).toContain('بارگذاری دوباره');
  expect(screen.getByRole('alert').textContent).toContain('وضعیت سفارش');expect(localStorage.getItem('phase6-synthetic-cart')).toBe('preserved');
  expect(error).toHaveBeenCalledWith('{"event":"ui_render_failed"}');
 });
});
