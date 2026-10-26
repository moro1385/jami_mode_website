import {afterCatalogMutation} from '@/features/catalog/catalogChanges';
import { supabase } from '@/integrations/supabase/client';
import { createInventoryService } from './application/inventoryService';
import { createSupabaseInventoryRepository } from './infrastructure/supabaseInventoryRepository';
// Registered-stock reads use the signed-in client and RLS; manual actions below use the guarded server API.
export const adminInventory=createInventoryService(createSupabaseInventoryRepository(supabase));

import {createAdjustmentJournal} from './infrastructure/browserAdjustmentJournal';
import {createHttpInventoryActions,type InventoryLock} from './infrastructure/httpInventoryActions';
const withInventoryLock:InventoryLock=async(name,work)=>{
 if(!navigator.locks?.request)throw Error('این مرورگر قفل مشترک لازم برای اصلاح انبار را ندارد.');
 return navigator.locks.request(name,{ifAvailable:true},async lock=>{if(!lock)throw Error('درخواست دیگری برای همین تنوع در حال بررسی است.');return work();});
};
const actions=()=>createHttpInventoryActions(supabase,(path,init)=>fetch(path,init),createAdjustmentJournal(window.localStorage,new URL(supabase.storage.from('product-images').getPublicUrl('__scope__').data.publicUrl).host),withInventoryLock);
export const adminInventoryActions={
 status:(...args:Parameters<ReturnType<typeof actions>['status']>)=>actions().status(...args),
 pending:(...args:Parameters<ReturnType<typeof actions>['pending']>)=>actions().pending(...args),
 adjust:afterCatalogMutation((...args:Parameters<ReturnType<typeof actions>['adjust']>)=>actions().adjust(...args)),
 history:(...args:Parameters<ReturnType<typeof actions>['history']>)=>actions().history(...args),
};

import {createInventoryReport} from './infrastructure/httpInventoryReport';
// Read-only report does not require storage access, shared locks or write activation.
export const adminInventoryReport=createInventoryReport(supabase,(path,init)=>fetch(path,init));

import {createInventoryPolicy} from './infrastructure/httpInventoryPolicy';
export const adminInventoryPolicy=createInventoryPolicy(supabase,(path,init)=>fetch(path,init));

import {createInventoryAlerts} from './infrastructure/httpInventoryAlerts';
export const adminInventoryAlerts=createInventoryAlerts(supabase,(path,init)=>fetch(path,init));

import {createInventoryFollowup} from './infrastructure/httpInventoryFollowup';
export const adminInventoryFollowup=createInventoryFollowup(supabase,(path,init)=>fetch(path,init));

import {createInventoryAssignments} from './infrastructure/httpInventoryAssignments';
export const adminInventoryAssignments=createInventoryAssignments(supabase,(path,init)=>fetch(path,init));

import {createSupabaseVariantPages} from './infrastructure/supabaseVariantPages';
export const adminInventoryVariantPages=createSupabaseVariantPages(supabase);
