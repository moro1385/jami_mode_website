import {describe,it,expect} from 'vitest';
// Full Zod is a test-only reference for the contract before bundle optimization.
import {z} from 'zod';
import {validatedCartItems} from '../features/cart/domain/cart';

const before=z.array(z.object({
 id:z.string(),productId:z.string(),productTitle:z.string(),productHandle:z.string(),image:z.string(),
 price:z.object({amount:z.string(),currencyCode:z.string()}),quantity:z.number().int().positive().max(100),
 selectedSize:z.string().nullable(),selectedColor:z.string().nullable(),
})).max(100);
const item={id:'product::M::blue',productId:'product',productTitle:'عنوان محصول',productHandle:'جوراب',image:'/image.webp',price:{amount:'10000',currencyCode:'IRR'},quantity:1,selectedSize:'M',selectedColor:'blue'};
const cases:unknown[]=[null,undefined,true,0,'[]',{},[],[item],[{...item,quantity:100,selectedSize:null,selectedColor:null}],Array.from({length:100},()=>item),Array.from({length:101},()=>item),[item,{bad:true}],[{...item,extra:'ignored',price:{...item.price,extra:'ignored'}}]];
for(const key of Object.keys(item)){
 const missing={...item} as Record<string,unknown>;delete missing[key];cases.push([missing]);
 for(const value of [null,undefined,0,true,{},[]])cases.push([{...item,[key]:value}]);
}
for(const quantity of [NaN,Infinity,-Infinity,-0,-1,.5,1.5,101,Number.MAX_SAFE_INTEGER,Number.MAX_SAFE_INTEGER+1,'1'])cases.push([{...item,quantity}]);
for(const price of [{amount:'1'},{currencyCode:'IRR'},{amount:1,currencyCode:'IRR'},{amount:'1',currencyCode:null}])cases.push([{...item,price}]);

describe('cart validation contract after bundle optimization',()=>{
 it.each(cases.map((value,index)=>({value,index})))('matches previous acceptance and parsed fields for case $index',({value})=>{
  const parsed=before.safeParse(value);
  expect(validatedCartItems(value)).toEqual(parsed.success?parsed.data:null);
 });
 it('returns detached snapshots and preserves unknown-field stripping at both levels',()=>{
  const input={...item,price:{...item.price,secret:'ignored'},wallet_balance:999};
  const output=validatedCartItems([input]);expect(output).toEqual([item]);
  if(!output)throw Error('Expected valid cart');
  output[0].price.amount='changed';expect(input.price.amount).toBe('10000');
 });
});
