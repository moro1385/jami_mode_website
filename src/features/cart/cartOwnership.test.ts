import { beforeEach, afterEach, expect, it } from 'vitest';
import { useCartStore } from '@/stores/cartStore';
import { browserStorageKey } from '../../../config/supabase-public.js';
const key = browserStorageKey('storefront-cart', import.meta.env.MODE), authKey = browserStorageKey('jamimode-auth', import.meta.env.MODE);
const item = { id: 'p', productId: 'p', productTitle: 'Fixture', productHandle: 'p', image: '', quantity: 1, price: { amount: '1', currencyCode: 'IRR' }, selectedSize: null, selectedColor: null };
beforeEach(() => { localStorage.clear(); useCartStore.getState().resetOwner(); });
afterEach(() => { useCartStore.getState().resetOwner(); localStorage.clear(); });
it('preserves a guest cart on first binding but clears an owned cart when changing accounts', () => {
 useCartStore.getState().setItems([item]); useCartStore.getState().bindOwner('A'); expect(useCartStore.getState().items).toEqual([item]);
 useCartStore.getState().bindOwner('A'); expect(useCartStore.getState().items).toEqual([item]);
 useCartStore.getState().bindOwner('B'); expect(useCartStore.getState().items).toEqual([]);
});
it('does not hydrate another account’s owned cache or overwrite store actions with persisted properties', async () => {
 localStorage.setItem(authKey, JSON.stringify({ state: { user: { id: 'A' } } }));
 localStorage.setItem(key, JSON.stringify({ state: { ownerId: 'B', items: [item], setItems: 'forged' }, version: 0 }));
 await useCartStore.persist.rehydrate(); expect(useCartStore.getState().items).toEqual([]); expect(typeof useCartStore.getState().setItems).toBe('function');
 localStorage.setItem(key, JSON.stringify({ state: { ownerId: 'A', items: [item], setItems: 'forged' }, version: 0 }));
 await useCartStore.persist.rehydrate(); expect(useCartStore.getState().items).toEqual([item]); expect(typeof useCartStore.getState().setItems).toBe('function');
});
it('keeps valid legacy guest persistence compatible and removes ownership on logout', async () => {
 localStorage.setItem(key, JSON.stringify({ state: { items: [item] }, version: 0 })); await useCartStore.persist.rehydrate();
 expect(useCartStore.getState().ownerId).toBeNull(); expect(useCartStore.getState().items).toEqual([item]);
 useCartStore.getState().bindOwner('A'); useCartStore.getState().resetOwner(); expect(useCartStore.getState().ownerId).toBeNull(); expect(useCartStore.getState().items).toEqual([]);
});
