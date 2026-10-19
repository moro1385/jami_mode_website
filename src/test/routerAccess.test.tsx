import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { cleanup, fireEvent, render, screen, waitFor, act } from '@testing-library/react';
import { BrowserRouter, Link, Route, Routes, useLocation, useParams } from 'react-router-dom';
import RequireAdmin from '@/components/auth/RequireAdmin';
import RequireAuth from '@/components/auth/RequireAuth';
import RedirectIfAuthenticated from '@/components/auth/RedirectIfAuthenticated';

type State = {session: {userId: string; token: string; expiresAt: number} | null; user: {id: string} | null; isBootstrapping: boolean; bootstrap: () => Promise<void>};
const mocks = vi.hoisted(() => ({ state: {} as State, rpc: vi.fn(), bootstrap: vi.fn() }));
vi.mock('@/stores/authStore', () => ({useAuthStore: (selector: (state: State) => unknown) => selector(mocks.state)}));
vi.mock('@/integrations/supabase/client', () => ({supabase: {rpc: mocks.rpc}}));
function Location() {const l=useLocation();return <output data-testid="location">{l.pathname+l.search+l.hash}</output>;}
function Product() {return <p>product {useParams().slug}</p>;}
function Tree() {return <BrowserRouter><Location/><Routes>
 <Route path="/" element={<><p>home</p><Link to="/product/shirt">browse</Link></>}/>
 <Route element={<RedirectIfAuthenticated/>}><Route path="/signin" element={<p>sign in</p>}/></Route>
 <Route element={<RequireAuth/>}><Route path="/checkout/verify" element={<p>callback</p>}/><Route path="/account" element={<p>account</p>}/></Route>
 <Route element={<RequireAdmin/>}><Route path="/admin" element={<p>admin private</p>}/></Route>
 <Route path="/product/:slug" element={<Product/>}/>
 </Routes></BrowserRouter>;}
function account(id: string, token=id) {mocks.state={session:{userId:id,token,expiresAt:Date.now()+60000},user:{id},isBootstrapping:false,bootstrap:mocks.bootstrap};}
function deferred() {let resolve!: (value: {data:boolean;error:null})=>void;const promise=new Promise<{data:boolean;error:null}>(r=>{resolve=r;});return {promise,resolve};}
beforeEach(()=>{vi.clearAllMocks();mocks.bootstrap.mockResolvedValue(undefined);mocks.state={session:null,user:null,isBootstrapping:false,bootstrap:mocks.bootstrap};window.history.replaceState({},'', '/');});
afterEach(cleanup);
describe('Router 7 access and navigation regression',()=>{
 it('keeps payment callback parameters through sign-in and resume',async()=>{
  const destination='/checkout/verify?orderId=synthetic&trans_id=123&id_get=456#return';
  window.history.replaceState({},'',destination);const view=render(<Tree/>);
  await screen.findByText('sign in');expect(new URL(window.location.href).searchParams.get('returnTo')).toBe(destination);
  account('customer');view.rerender(<Tree/>);await screen.findByText('callback');expect(screen.getByTestId('location').textContent).toBe(destination);
 });
 it.each(['https://evil.invalid','//evil.invalid','/\\evil.invalid','/admin'])('rejects an untrusted auth return %s',async destination=>{
  account('customer');window.history.replaceState({},'', '/signin?'+new URLSearchParams({returnTo:destination}));render(<Tree/>);await screen.findByText('account');expect(window.location.pathname).toBe('/account');
 });
 it('preserves product navigation and back/forward with the real browser router',async()=>{
  render(<Tree/>);fireEvent.click(screen.getByText('browse'));await screen.findByText('product shirt');
  act(()=>window.history.back());await screen.findByText('home');
  act(()=>window.history.forward());await screen.findByText('product shirt');
 });
 it('does not render protected account content with a different session user',()=>{
  account('new');mocks.state.user={id:'old'};window.history.replaceState({},'','/account');render(<Tree/>);expect(screen.queryByText('account')).not.toBeInTheDocument();expect(mocks.bootstrap).toHaveBeenCalledOnce();
 });
 it('removes a previous admin view while the next account role is pending',async()=>{
  const next=deferred();account('admin');mocks.rpc.mockResolvedValueOnce({data:true,error:null}).mockReturnValueOnce(next.promise);window.history.replaceState({},'','/admin');const view=render(<Tree/>);await screen.findByText('admin private');
  account('customer');view.rerender(<Tree/>);expect(screen.queryByText('admin private')).not.toBeInTheDocument();await act(async()=>next.resolve({data:false,error:null}));await screen.findByText('home');
 });
 it('ignores late admin approval for a previous account',async()=>{
  const old=deferred(),next=deferred();account('admin');mocks.rpc.mockReturnValueOnce(old.promise).mockReturnValueOnce(next.promise);window.history.replaceState({},'','/admin');const view=render(<Tree/>);await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledTimes(1));
  account('customer');view.rerender(<Tree/>);await waitFor(()=>expect(mocks.rpc).toHaveBeenCalledTimes(2));await act(async()=>old.resolve({data:true,error:null}));expect(screen.queryByText('admin private')).not.toBeInTheDocument();
  await act(async()=>next.resolve({data:false,error:null}));await screen.findByText('home');
 });
 it('rechecks a renewed session and stays closed when the role was removed',async()=>{
  const next=deferred();account('admin','one');mocks.rpc.mockResolvedValueOnce({data:true,error:null}).mockReturnValueOnce(next.promise);window.history.replaceState({},'','/admin');const view=render(<Tree/>);await screen.findByText('admin private');
  account('admin','two');view.rerender(<Tree/>);expect(screen.queryByText('admin private')).not.toBeInTheDocument();await act(async()=>next.resolve({data:false,error:null}));await screen.findByText('home');
 });
 it('does not render the admin outlet after a rejected role request',async()=>{
  account('customer');mocks.rpc.mockRejectedValueOnce(new Error('synthetic transport failure'));window.history.replaceState({},'','/admin');render(<Tree/>);await screen.findByText('home');expect(screen.queryByText('admin private')).not.toBeInTheDocument();
 });
});
