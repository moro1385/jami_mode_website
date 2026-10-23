import { serializeCartItems, type CartItem } from '../domain/cart';
export type CartSyncStatus = 'loading' | 'saving' | 'synced' | 'pending' | 'offline' | 'error';
export interface CartSyncPorts {
 load(ownerId: string): Promise<CartItem[]>; save(ownerId: string, items: CartItem[]): Promise<void>;
 getItems(): CartItem[]; replaceItems(items: CartItem[]): void;
 subscribe(changed: () => void): () => void; isCurrent(): boolean;
 delay(task: () => void, milliseconds: number): () => void; reportError(error: unknown): void;
 stage?(items: CartItem[]): Promise<unknown>; afterStage?(): void;
 online?(): boolean; status?(status: CartSyncStatus): void; replaceEmpty?: boolean;
}
export function createCartSyncController(ownerId: string, ports: CartSyncPorts) {
 let active = false, started = false, ready = false, dirty = false, replacing = false, writing = false, reading = false, readFailed = false;
 let revision = 0, stagedVersion = 0, lastStage: Promise<unknown> = Promise.resolve();
 let cancelTimer: (() => void) | undefined, unsubscribe: (() => void) | undefined;
 const current = () => active && ports.isCurrent(), online = () => ports.online?.() !== false;
 const status = (value: CartSyncStatus) => { if (current()) ports.status?.(!online() ? 'offline' : !ready && readFailed && value !== 'loading' ? 'error' : value); };
 const schedule = () => {
  cancelTimer?.(); cancelTimer = undefined;
  if (current() && ready && dirty && online()) cancelTimer = ports.delay(() => { cancelTimer = undefined; void save(); }, 600);
 };
 const stage = () => {
  if (!ports.stage) { schedule(); return; }
  const version = ++stagedVersion;
  try { lastStage = Promise.resolve(ports.stage(serializeCartItems(ports.getItems()))); }
  catch (error) { lastStage = Promise.reject(error); }
  void lastStage.then(() => {
   if (!current() || version !== stagedVersion) return;
   ports.afterStage?.(); schedule();
  }, error => { if (current()) { ports.reportError(error); status('error'); } });
 };
 const save = async () => {
  if (!current() || !ready || !dirty || writing || !online()) return;
  const savedRevision = revision; dirty = false; writing = true; status('saving'); let failed = false;
  try {
   await lastStage;
   if (!current() || !online()) { dirty = true; return; }
   await ports.save(ownerId, serializeCartItems(ports.getItems()));
   status(dirty ? 'pending' : 'synced');
  } catch (error) { failed = true; dirty = true; if (current()) { ports.reportError(error); status('error'); } }
  finally { writing = false; if (current() && dirty && (!failed || revision !== savedRevision)) schedule(); }
 };
 const load = async () => {
  if (!current() || reading || !online()) { if (!online()) status('offline'); return; }
  reading = true; const readRevision = revision; status('loading');
  try {
   const serverItems = await ports.load(ownerId);
   if (!current()) return;
   if ((serverItems.length || ports.replaceEmpty) && (ports.replaceEmpty ? revision === readRevision : revision === 0)) {
    replacing = true; try { ports.replaceItems(serverItems); } finally { replacing = false; }
   }
   ready = true; readFailed = false; dirty = true; status('pending'); schedule();
  } catch (error) { readFailed = true; if (current()) { ports.reportError(error); status('error'); } }
  finally { reading = false; }
 };
 const stop = () => { active = false; cancelTimer?.(); cancelTimer = undefined; unsubscribe?.(); unsubscribe = undefined; };
 return {
  start() {
   if (started || !ownerId) return; started = true; active = true;
   unsubscribe = ports.subscribe(() => { if (!current() || replacing) return; revision++; dirty = true; status('pending'); stage(); });
   void load();
  },
  acceptExternal(items: CartItem[], pending: boolean) {
   if (!current()) return;
   revision++; replacing = true;
   try { if (JSON.stringify(ports.getItems()) !== JSON.stringify(items)) ports.replaceItems(items); }
   finally { replacing = false; }
   dirty = pending; status(pending ? 'pending' : 'synced'); if (pending) schedule();
  },
  retry() {
   if (!current()) return;
   if (!online()) { status('offline'); return; }
   // Retry on an explicit action/reconnect only. Never loop on a denied or failed request.
   if (dirty) stage();
   if (!ready) void load(); else schedule();
  },
  networkChanged() { if (!online()) { cancelTimer?.(); cancelTimer = undefined; status('offline'); } else this.retry(); },
  stop,
 };
}
