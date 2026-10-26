import { useCallback } from 'react';
import { adminInventory } from '../admin';
import { useScopedAsyncRead } from '@/shared/presentation/useScopedAsyncRead';
export function useInventory(ownerId: string | undefined, offset: number){
 const load=useCallback(()=>adminInventory.read(offset),[offset]);
 return useScopedAsyncRead(ownerId?JSON.stringify([ownerId,offset]):undefined,load);
}
