import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';
export async function runInventoryBoundaryTests({psql}) {
 let assertions=0;
 const query=sql=>psql('-c',sql).trim().split(/\r?\n/).at(-1);
 const check=(actual,expected)=>{assert.deepEqual(actual,expected);assertions++;};
 const denied=(sql,pattern=/permission denied|row-level security/)=>{let failure;try{query(sql);}catch(error){failure=error;}assert.ok(failure,'Expected denied SQL');assert.match(String(failure.stderr??failure.message),pattern);assertions++;};
 const admin=randomUUID(),customer=randomUUID(),product=randomUUID();
 const as=(who,sql)=>`SET ROLE authenticated;SET request.jwt.claim.sub='${who}';${sql}`;
 query(`INSERT INTO auth.users(id) VALUES('${admin}'),('${customer}');INSERT INTO public.user_roles(user_id,role) VALUES('${admin}','admin');INSERT INTO public.products(id,name,slug,price,is_active) VALUES('${product}','Boundary fixture','boundary-${product}',10000,true)`);
 query(as(admin,`INSERT INTO public.product_variants(product_id,size,color,sku,price) VALUES('${product}','M','red','boundary-${product}',10000)`));
 const variant=query(`SELECT id FROM public.product_variants WHERE product_id='${product}'`);
 check(query(`SELECT stock_quantity FROM public.product_variants WHERE id='${variant}'`),'0');
 for(const role of ['anon','authenticated']) {
  for(const privilege of ['INSERT','UPDATE'])check(query(`SELECT has_column_privilege('${role}','public.product_variants','stock_quantity','${privilege}')`),'f');
  for(const table of ['products','product_variants'])for(const privilege of ['DELETE','TRUNCATE'])check(query(`SELECT has_table_privilege('${role}','public.${table}','${privilege}')`),'f');
 }
 for(const who of [admin,customer]){
  denied(as(who,`UPDATE public.product_variants SET stock_quantity=999 WHERE id='${variant}'`));
  denied(as(who,`INSERT INTO public.product_variants(product_id,size,stock_quantity) VALUES('${product}','L',999)`));
  denied(as(who,`INSERT INTO public.product_variants(product_id,size,stock_quantity) VALUES('${product}','XL',0)`));
  denied(as(who,`DELETE FROM public.product_variants WHERE id='${variant}'`));
  denied(as(who,`DELETE FROM public.products WHERE id='${product}'`));
  denied(as(who,`UPDATE public.product_variants SET product_id='${randomUUID()}' WHERE id='${variant}'`));
 }
 denied(as(admin,`UPDATE public.product_variants SET size='L',stock_quantity=0 WHERE id='${variant}'`));
 check(query(`SELECT size FROM public.product_variants WHERE id='${variant}'`),'M');
 query(as(admin,`UPDATE public.product_variants SET size='L',color='blue',sku='edited-${product}',price=0 WHERE id='${variant}'`));
 check(query(`SELECT concat(size,':',color,':',price,':',stock_quantity) FROM public.product_variants WHERE id='${variant}'`),'L:blue:0.00:0');
 denied(as(customer,`INSERT INTO public.product_variants(product_id,size) VALUES('${product}','S')`));
 query(as(customer,`UPDATE public.product_variants SET size='forged' WHERE id='${variant}'`));
 check(query(`SELECT size FROM public.product_variants WHERE id='${variant}'`),'L');
 query(as(admin,`UPDATE public.products SET is_active=false WHERE id='${product}'`));
 check(query(`SELECT is_active FROM public.products WHERE id='${product}'`),'f');
 check(query(`SELECT count(*) FROM public.product_variants WHERE id='${variant}'`),'1');
 check(query(as(customer,`SELECT count(*) FROM public.products WHERE id='${product}'`)),'0');
 check(query(as(admin,`SELECT count(*) FROM public.products WHERE id='${product}'`)),'1');
 // Owner/service routines are deliberately outside the browser-role restriction.
 query(`SET ROLE service_role;UPDATE public.product_variants SET stock_quantity=5 WHERE id='${variant}'`);
 check(query(`SELECT stock_quantity FROM public.product_variants WHERE id='${variant}'`),'5');
 // Replay clears even historical column-level grants, not just table grants.
 query('GRANT UPDATE(stock_quantity),INSERT(stock_quantity) ON public.product_variants TO anon');
 psql('-f','supabase/migrations/20261024143147_phase5_inventory_write_boundary.sql');
 check(query("SELECT has_column_privilege('anon','public.product_variants','stock_quantity','UPDATE')"),'f');
 check(query("SELECT has_column_privilege('anon','public.product_variants','stock_quantity','INSERT')"),'f');
 // Unknown inherited grants abort the entire migration rather than silently claiming protection.
 query('CREATE ROLE fixture_inventory_inherited NOLOGIN;GRANT UPDATE ON public.product_variants TO fixture_inventory_inherited;GRANT fixture_inventory_inherited TO authenticated');
 let rejected;try{psql('-f','supabase/migrations/20261024143147_phase5_inventory_write_boundary.sql');}catch(error){rejected=error;}
 assert.ok(rejected);assert.match(String(rejected.stderr??rejected.message),/inherited table privilege retained/);assertions++;
 query('REVOKE fixture_inventory_inherited FROM authenticated;DROP OWNED BY fixture_inventory_inherited;DROP ROLE fixture_inventory_inherited');
 check(query("SELECT has_column_privilege('authenticated','public.product_variants','stock_quantity','UPDATE')"),'f');
 console.log('INVENTORY_BOUNDARY_DB_TEST_REPORT '+JSON.stringify({assertions,passed:true,productionAccess:false}));
}
