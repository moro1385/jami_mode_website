import {describe,it,expect} from 'vitest';
import {z} from 'zod';
import {zodResolver} from '@hookform/resolvers/zod';
import {productSchema,productFormParseOptions,type ProductFormInput} from '../features/catalog/domain/productForm';

// Previous schema is a test-only oracle, including its historical coercion rules.
const before=z.object({
 name:z.string().min(1,'Name is required'),slug:z.string().min(1,'Slug is required'),description:z.string().optional().nullable(),price:z.coerce.number<number>().min(0,'Price must be positive'),
 is_active:z.boolean().default(true),is_out_of_stock:z.boolean().default(false),is_featured:z.boolean().default(false),is_new:z.boolean().default(false),category_id:z.string().optional().nullable(),tags:z.array(z.string()).default([]),
 department:z.string().optional().nullable(),category:z.string().optional().nullable(),type:z.array(z.string()).default([]),colors:z.array(z.string()).default([]),brand:z.array(z.string()).optional(),pattern:z.string().optional().nullable(),sizes:z.array(z.string()).default([]),
});
const minimal={name:'محصول',slug:'product',price:1000};
const cases:unknown[]=[null,undefined,{},[],minimal,{...minimal,price:'123.5'},{...minimal,price:''},{...minimal,price:null},{...minimal,price:false},{...minimal,extra:'ignored'}];
for(const field of ['name','slug','description','price','is_active','is_out_of_stock','is_featured','is_new','category_id','tags','department','category','type','colors','brand','pattern','sizes']){
 for(const value of [undefined,null,'',-1,0,1,true,false,[],['قرمز'],[1],{}])cases.push({...minimal,[field]:value});
}
for(const price of [NaN,Infinity,-Infinity,.5,-.5,'bad',' 10 ',Number.MAX_SAFE_INTEGER])cases.push({...minimal,price});
type ParseResult={success:boolean;data?:unknown;error?:{issues:readonly {path:PropertyKey[];code:string;message:string}[]}};
function contract(result:ParseResult){return result.success?{success:true,data:result.data}:{success:false,issues:result.error?.issues.map(({path,code,message})=>({path,code,message}))};}

describe('lightweight product form validation',()=>{
 it.each(cases.map((value,index)=>({value,index})))('preserves parsed values and issue messages for case $index',({value})=>{
  expect(contract(productSchema.safeParse(value,productFormParseOptions))).toEqual(contract(before.safeParse(value)));
 });
 it('retains React Hook Form resolver field errors and custom messages',async()=>{
  const values={name:'',slug:'',price:-1} satisfies ProductFormInput;
  const options={fields:{},shouldUseNativeValidation:false,criteriaMode:'all' as const};
  const actual=await zodResolver(productSchema,productFormParseOptions)(values,undefined,options);
  const expected=await zodResolver(before)(values,undefined,options);
  expect(actual).toEqual(expected);
 });
 it('retains resolver coercion and defaults without mutating the form input',async()=>{
  const values={...minimal};
  const result=await zodResolver(productSchema,productFormParseOptions)(values,undefined,{fields:{},shouldUseNativeValidation:false});
  expect(result.errors).toEqual({});expect(result.values).toEqual(before.parse(values));
  expect(values).toEqual(minimal);
 });
});
