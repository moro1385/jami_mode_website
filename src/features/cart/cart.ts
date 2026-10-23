import { supabase } from '@/integrations/supabase/client';
import { publicSupabaseConfig } from '../../../config/supabase-public.js';
import { createCartService } from './application/cartService';
import { createCartCoordinator } from './application/cartCoordinator';
import { createSupabaseCartRepository } from './infrastructure/supabaseCartRepository';
import { createBrowserCartLocks, createBrowserCartSnapshots } from './infrastructure/browserCartSnapshots';
import type { CartItem } from './domain/cart';
const configuration = publicSupabaseConfig({ MODE: import.meta.env.MODE, VITE_SUPABASE_URL: import.meta.env.VITE_SUPABASE_URL, VITE_SUPABASE_PUBLISHABLE_KEY: import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY });
const namespace = 'jami:' + new URL(configuration.url).hostname + ':' + import.meta.env.MODE;
const browser = createBrowserCartSnapshots({ getItem: key => localStorage.getItem(key), setItem: (key, value) => localStorage.setItem(key, value) }, namespace);
const transport = createCartService(createSupabaseCartRepository(supabase), () => new Date().toISOString(), error => console.error('Cart flush failed:', error));
const coordinator = createCartCoordinator({ remote: transport, storage: browser.snapshots,
 locks: createBrowserCartLocks(namespace, typeof navigator !== 'undefined' ? navigator.locks : undefined),
 currentOwner: async () => { const { data, error } = await supabase.auth.getSession(); return !error ? data.session?.user.id ?? null : null; },
 revision: () => crypto.randomUUID(),
});
export const accountCart = {
 supported: typeof navigator !== 'undefined' && typeof navigator.locks?.request === 'function',
 load: async (owner: string, seed: CartItem[] = [], current?: () => boolean) => (await coordinator.load(owner, seed, current)).items,
 save: async (owner: string, _items: CartItem[], current?: () => boolean) => coordinator.commit(owner, current),
 flush: async (owner: string, _items: CartItem[]) => coordinator.commit(owner),
 stage: coordinator.stage, snapshot: coordinator.peek, storageEventMatches: browser.matches,
};
