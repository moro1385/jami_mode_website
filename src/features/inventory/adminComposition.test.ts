import {afterEach,beforeEach,expect,it,vi} from 'vitest';
const mock=vi.hoisted(()=>({adjust:vi.fn()}));
vi.mock('@/integrations/supabase/client',()=>({supabase:{storage:{from:()=>({getPublicUrl:()=>({data:{publicUrl:'https://synthetic.supabase.co/journal'}})})}}}));
vi.mock('./infrastructure/httpInventoryActions',()=>({createHttpInventoryActions:()=>({adjust:mock.adjust})}));
import {adminInventoryActions} from './admin';
import {catalogChanges} from '@/features/catalog/catalogChanges';
import type {AdjustmentTarget} from './domain/adjustments';
let stop:()=>void;
beforeEach(()=>vi.resetAllMocks());afterEach(()=>stop?.());
it('invalidates catalog readers after a confirmed inventory action and preserves the receipt',async()=>{
 const listener=vi.fn();stop=catalogChanges.subscribe(listener);const receipt={entry:{id:'synthetic-receipt'},recoveryWarning:true};mock.adjust.mockResolvedValue(receipt);
 expect(await adminInventoryActions.adjust('owner',{} as AdjustmentTarget,()=>true)).toBe(receipt);
 expect(listener).toHaveBeenCalledTimes(1);
});
it('does not announce an unconfirmed adjustment as a successful catalog mutation',async()=>{
 const listener=vi.fn();stop=catalogChanges.subscribe(listener);const failure=Error('unknown outcome');mock.adjust.mockRejectedValue(failure);
 await expect(adminInventoryActions.adjust('owner',{} as AdjustmentTarget,()=>true)).rejects.toBe(failure);
 expect(listener).not.toHaveBeenCalled();
});
