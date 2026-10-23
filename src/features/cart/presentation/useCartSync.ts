import { useEffect } from 'react';
import { useAuthStore } from '@/stores/authStore';
import { useCartStore } from '@/stores/cartStore';
import { accountCart } from '../cart';
import { createCartSyncController } from '../application/cartSyncController';
import { useCartSyncState } from './cartSyncState';
export function useCartSync() {
 const userId = useAuthStore(state => state.user?.id), session = useAuthStore(state => state.session);
 const ownerId = userId && session?.userId === userId && session.expiresAt > Date.now() ? userId : undefined;
 useEffect(() => {
  if (!ownerId) return;
  let active = true;
  const current = () => {
   const { user, session: auth } = useAuthStore.getState();
   return active && user?.id === ownerId && auth?.userId === ownerId && auth.expiresAt > Date.now();
  };
  const seed = useCartStore.getState().ownerId === null ? useCartStore.getState().items : [];
  useCartStore.getState().bindOwner(ownerId);
  const reconcile = () => {
   if (!current()) return;
   const snapshot = accountCart.snapshot(ownerId);
   if (snapshot) controller.acceptExternal(snapshot.items, snapshot.pending);
  };
  const controller = createCartSyncController(ownerId, {
   load: id => accountCart.load(id, seed, current),
   save: (id, items) => accountCart.save(id, items, current),
   stage: items => accountCart.stage(ownerId, items, current), afterStage: reconcile,
   getItems: () => useCartStore.getState().items,
   replaceItems: items => useCartStore.getState().setItems(items),
   subscribe: changed => useCartStore.subscribe((state, previous) => { if (state.items !== previous.items) changed(); }),
   isCurrent: current, online: () => navigator.onLine,
   delay: (task, milliseconds) => { const timer = setTimeout(task, milliseconds); return () => clearTimeout(timer); },
   reportError: error => console.error('Cart synchronization failed:', error), replaceEmpty: true,
   status: status => { if (current()) useCartSyncState.setState({ ownerId, status, retry, unavailable: !accountCart.supported }); },
  });
  const retry = () => controller.retry();
  try { const saved = accountCart.snapshot(ownerId); if (saved?.pending) useCartStore.getState().setItems(saved.items); }
  catch (error) { console.error('Cart snapshot unavailable:', error); }
  const storageChanged = (event: StorageEvent) => {
   if (event.storageArea && event.storageArea !== localStorage) return;
   if (accountCart.storageEventMatches(ownerId, event.key)) {
    try { reconcile(); } catch (error) { console.error('Cart snapshot unavailable:', error); if (current()) useCartSyncState.setState({ ownerId, status: 'error', retry, unavailable: !accountCart.supported }); }
   }
  };
  const networkChanged = () => controller.networkChanged();
  window.addEventListener('storage', storageChanged); window.addEventListener('online', networkChanged); window.addEventListener('offline', networkChanged);
  controller.start();
  return () => {
   active = false; controller.stop(); window.removeEventListener('storage', storageChanged);
   window.removeEventListener('online', networkChanged); window.removeEventListener('offline', networkChanged);
   if (useCartSyncState.getState().retry === retry) useCartSyncState.setState({ ownerId: undefined, status: 'loading', retry: undefined });
  };
 }, [ownerId]);
}
