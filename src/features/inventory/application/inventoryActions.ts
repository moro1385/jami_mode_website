import type { AdjustmentEntry, AdjustmentTarget } from '../domain/adjustments';
export type InventoryCursor={before:string;beforeId:string};
export interface InventoryActions {
 status(owner:string,current:()=>boolean):Promise<{adjustmentsEnabled:boolean;historyAvailable:boolean}>;
 pending(owner:string,product:string,variant:string):AdjustmentTarget|undefined;
 adjust(owner:string,target:AdjustmentTarget,current:()=>boolean):Promise<{entry:AdjustmentEntry;recoveryWarning:boolean}>;
 history(owner:string,product:string,variant:string,cursor:InventoryCursor|null,current:()=>boolean):Promise<{entries:AdjustmentEntry[];hasMore:boolean;nextCursor:InventoryCursor|null}>;
}
