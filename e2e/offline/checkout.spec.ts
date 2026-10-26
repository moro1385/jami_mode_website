import { test, expect, type Page } from '@playwright/test';

test('inventory navigation reaches variants beyond 200 and keeps their operations accessible',async({page})=>{
 const fixture=await fixtures(page,{admin:true});const requests:URL[]=[];
 const variants=Array.from({length:251},(_,n)=>({id:'82000000-0000-4000-8000-'+String(n+1).padStart(12,'0'),product_id:productId,sku:'NAV-SKU-'+(n+1),size:'M',color:null,stock_quantity:n+1}));
 await page.route('**/rest/v1/products?*',async route=>{
  expect(route.request().method()).toBe('GET');const url=new URL(route.request().url());requests.push(url);const detail=url.searchParams.has('id'),cursor=url.searchParams.get('product_variants.id')?.replace(/^gt\./,'');const children=detail?variants.filter(v=>!cursor||v.id>cursor).slice(0,51):variants.slice(0,201);
  await route.fulfill({status:200,headers:{'Content-Type':'application/json','Content-Range':'0-0/1','Access-Control-Expose-Headers':'Content-Range'},body:JSON.stringify([{id:productId,name:'محصول پرتنوع مرورگر',is_active:true,is_out_of_stock:false,product_variants:children}])});
 });
 await page.goto('/admin/inventory');await page.getByRole('button',{name:'همهٔ تنوع‌ها: محصول پرتنوع مرورگر',exact:true}).click();const all=page.getByRole('dialog');await expect(all.getByText('همهٔ تنوع‌های محصول',{exact:true})).toBeVisible();
 for(let start=1;start<=251;start+=50){await expect(all.getByText('NAV-SKU-'+start+'؛',{exact:false})).toBeVisible();if(start<251)await all.getByRole('button',{name:'تنوع‌های بعدی',exact:true}).click();}
 await expect(all.getByRole('button',{name:'تنوع‌های بعدی',exact:true})).toBeDisabled();await all.getByRole('button',{name:'تفکیک موجودی تنوع',exact:true}).click();await expect(page.getByRole('heading',{name:'تفکیک موجودی و رزرو',exact:true})).toBeVisible();await page.keyboard.press('Escape');await page.getByRole('button',{name:'تنوع‌های قبلی',exact:true}).click();await expect(page.getByText('NAV-SKU-201؛',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'شروع دوباره از اولین تنوع',exact:true}).click();await expect(page.getByText('NAV-SKU-1؛',{exact:false})).toBeVisible();
 expect(requests.filter(u=>u.searchParams.has('id')).every(u=>u.searchParams.get('product_variants.limit')==='51')).toBe(true);expect(fixture.calls.filter(c=>c.path.startsWith('/api/admin/inventory/adjust'))).toHaveLength(0);
 await page.screenshot({path:'.phase3-e2e-artifacts/variant-pages-preview.png',fullPage:false});
});

async function expandInventoryRows(page:Page){const buttons=page.getByRole('button',{name:'جزئیات تنوع‌ها',exact:true});await buttons.first().waitFor();for(const button of await buttons.all())if(await button.getAttribute('aria-expanded')==='false')await button.click();}

const owner = '81000000-0000-4000-8000-000000000001';
const productId = '81000000-0000-4000-8000-000000000002';
const orderId = '81000000-0000-4000-8000-000000000003';
const addressId = '81000000-0000-4000-8000-000000000004';
const address = { id: addressId, label: 'خانه آزمایشی', recipient: 'کاربر آزمایشی', phone: '+989110000001', country: 'ایران', city: 'تهران', line1: 'نشانی ساختگی', line2: '', postalCode: '1234567890', isDefault: true };
const item = { id: productId + '::M::none', productId, productTitle: 'کالای آزمایشی فاز سه', productHandle: 'phase-three-fixture', image: '/placeholder.svg', price: { amount: '7000', currencyCode: 'IRR' }, quantity: 1, selectedSize: 'M', selectedColor: null };
const user = { id: owner, phone: '+989110000001', firstName: 'کاربر', lastName: 'آزمایشی', createdAt: '2026-01-01T00:00:00Z', addresses: [address], wallet: { balance: 99999999, currencyCode: 'IRR', transactions: [] }, orders: [] };
function authSession() {
  const expires = Math.floor(Date.now() / 1000) + 3600;
  const encode = (value: object) => Buffer.from(JSON.stringify(value)).toString('base64url');
  const token = encode({ alg: 'HS256', typ: 'JWT' }) + '.' + encode({ sub: owner, exp: expires, role: 'authenticated', aud: 'authenticated' }) + '.synthetic-signature';
  return { access_token: token, refresh_token: 'synthetic-refresh', expires_at: expires, expires_in: 3600, token_type: 'bearer', user: { id: owner, aud: 'authenticated', phone: user.phone, created_at: user.createdAt, app_metadata: { provider: 'phone', providers: ['phone'] }, user_metadata: {}, identities: [] } };
}
type Options = { paid?: boolean; signedIn?: boolean; admin?: boolean; failAddressDelete?: boolean; failDashboardOnce?: boolean; failCatalogOnce?: boolean; failOrdersOnce?: boolean; failLogout?: boolean; reuseStorage?: boolean };
type SharedCartFixture = { items: typeof item[]; writes: number[]; active: number; maximum: number; beforeWrite?: () => Promise<void> };
async function fixtures(page: Page, options: Options = {}, sharedCart?: SharedCartFixture) {
  const calls: { path: string; body: Record<string, unknown> | null }[] = [];
  const blocked: string[] = [];
  const cart: SharedCartFixture = sharedCart ?? { items: [item], writes: [], active: 0, maximum: 0 };
  let dashboardReads = 0, catalogReads = 0, orderReads = 0;
  const session = authSession();
  await page.addInitScript(({ user, item, address, session, signedIn, reuseStorage }) => {
    if (reuseStorage && localStorage.getItem('sb-cifhcrlmjnsxpkhyloen-auth-token')) return;
    if (signedIn) {
      localStorage.setItem('sb-cifhcrlmjnsxpkhyloen-auth-token', JSON.stringify(session));
      localStorage.setItem('jamimode-auth', JSON.stringify({ state: { user, session: { token: session.access_token, userId: user.id, expiresAt: Date.now() + 3600000 } }, version: 0 }));
    }
    localStorage.setItem('storefront-cart', JSON.stringify({ state: { items: [item] }, version: 0 }));
    sessionStorage.setItem('checkout-storage', JSON.stringify({ state: { selectedAddress: address, shippingMethod: 'express', shippingCost: 2000000 }, version: 0 }));
  }, { user, item, address, session, signedIn: options.signedIn !== false, reuseStorage: options.reuseStorage === true });
  await page.route('**/*', async route => {
    const req = route.request(), url = new URL(req.url());
    const local = url.origin === 'http://127.0.0.1:4179';
    const synthetic = url.hostname === 'cifhcrlmjnsxpkhyloen.supabase.co';
    const reply = (body: unknown, status = 200, headers: Record<string, string> = {}) => route.fulfill({ status, contentType: 'application/json', body: JSON.stringify(body), headers });
    if (local && !url.pathname.startsWith('/api/')) { await route.continue(); return; }
    if (!local && !synthetic) { blocked.push(url.hostname); await route.abort(); return; }
    const body = req.postData() ? JSON.parse(req.postData()!) : null;
    calls.push({ path: url.pathname, body });
    if (url.pathname === '/auth/v1/token') { await reply(session); return; }
    if (url.pathname === '/auth/v1/logout') { await reply(options.failLogout ? { message: 'Synthetic signout refusal' } : {}, options.failLogout ? 400 : 200); return; }
    if (url.pathname === '/auth/v1/user') { await reply(session.user); return; }
    if (url.pathname === '/rest/v1/profiles') {
      const profile = { id: owner, first_name: user.firstName, last_name: user.lastName, phone: user.phone, email: null, wallet_balance: 99999999 };
      await reply(req.headers().accept?.includes('vnd.pgrst.object') ? profile : [profile], 200, { 'content-range': '0-0/1' }); return;
    }
    if (url.pathname === '/rest/v1/addresses' && req.method() === 'DELETE' && options.failAddressDelete) { await reply({ code: '42501', message: 'Synthetic refusal' }, 403); return; }
    if (url.pathname === '/rest/v1/addresses') { await reply([{ ...address, user_id: owner, postal_code: address.postalCode, is_default: true }]); return; }
    if (url.pathname === '/rest/v1/carts') {
      if (req.method() !== 'GET') {
        cart.active++; cart.maximum = Math.max(cart.maximum, cart.active); cart.writes.push(body.items[0]?.quantity ?? 0);
        try { await cart.beforeWrite?.(); cart.items = body.items; await reply(null); } finally { cart.active--; }
      } else await reply({ items: cart.items });
      return;
    }
    if (url.pathname === '/rest/v1/rpc/has_role') { await reply(options.admin === true); return; }
    if (url.pathname === '/rest/v1/products') {
      catalogReads++; if (options.failCatalogOnce && catalogReads === 1) { await reply({ code: '42501', message: 'Synthetic catalog refusal' }, 403); return; }
      const product = { id: productId, name: item.productTitle, slug: item.productHandle, description: 'توضیح آزمایشی', price: 7000, is_active: true, is_out_of_stock: false, is_featured: true, is_new: true, images: ['/placeholder.svg'], created_at: user.createdAt, tags: [], sizes: ['M'], colors: [], brand: [], type: [], categories: { id: productId, slug: 'fixture', name: 'آزمایشی' }, product_images: [], product_variants: [] };
      await reply(req.headers().accept?.includes('vnd.pgrst.object') ? product : [product], 200, { 'content-range': '0-0/1' }); return;
    }
    if (url.pathname === '/rest/v1/user_messages') { await reply([], 200, { 'content-range': '*/0' }); return; }
    if (url.pathname === '/rest/v1/orders' && options.admin) { dashboardReads++; if (options.failDashboardOnce && dashboardReads === 1) { await reply({ code: '42501', message: 'Synthetic dashboard refusal' }, 403); return; } await reply([{ id: orderId, total_amount: 100 }, { id: addressId, total_amount: 200 }], 200, { 'content-range': '0-1/2' }); return; }
    if (url.pathname === '/rest/v1/orders') { orderReads++; if (options.failOrdersOnce && orderReads === 1) { await reply({ code: '42501', message: 'Synthetic order refusal' }, 403); return; } await reply([]); return; }
    if (url.pathname.startsWith('/rest/v1/')) { await reply([]); return; }
    if (url.pathname === '/api/wallet/summary') { await reply({ balance: 10000, currency: 'IRR', spendingEnabled: false, topupsEnabled: false, entries: [], pendingTopups: [], hasMore: false }); return; }
    if (url.pathname === '/api/bitpay/checkout/quote') { await reply({ quote: 'synthetic-server-proof', total: 9000, shipping: 2000 }); return; }
    if (url.pathname === '/api/bitpay/checkout') { await reply({ orderId }); return; }
    if (url.pathname === '/api/bitpay/verify') { await reply({ success: true }); return; }
    if (url.pathname === '/api/bitpay/init') { await reply({ success: true }); return; }
    if (url.pathname === '/api/bitpay/orders/' + orderId + '/status') { await reply({ orderId, paid: options.paid === true }); return; }
    await reply({ error: 'No offline fixture for endpoint' }, 501);
  });
  return { calls, blocked };
}

test('password sign-in uses the normalized phone and opens the account', async ({ page }) => {
  const fixture = await fixtures(page, { signedIn: false });
  await page.goto('/signin');
  await page.getByLabel('شماره موبایل', { exact: true }).fill('09110000001');
  await page.getByLabel('رمز عبور', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'اطلاعات شخصی' })).toBeVisible();
  expect(fixture.calls.find(call => call.path === '/auth/v1/token')?.body).toMatchObject({ phone: '+989110000001', password: 'synthetic-password' });
});

test('browser checkout confirms a server quote, reuses its key and clears only the paid receipt snapshot', async ({ page }) => {
  const fixture = await fixtures(page, { paid: true });
  await page.goto('/checkout/payment');
  const pay = page.getByRole('button', { name: 'پرداخت از طریق درگاه', exact: true });
  await pay.click();
  const confirm = page.getByRole('button', { name: 'تایید مبلغ و پرداخت از درگاه', exact: true });
  await expect(confirm).toBeEnabled();
  expect(fixture.calls.filter(call => call.path === '/api/bitpay/checkout')).toHaveLength(0);
  await confirm.click();
  await expect(page.getByRole('heading', { name: 'پرداخت با موفقیت انجام شد' })).toBeVisible();
  const first = fixture.calls.find(call => call.path === '/api/bitpay/checkout/quote')!.body!;
  const second = fixture.calls.find(call => call.path === '/api/bitpay/checkout')!.body!;
  expect(second.idempotencyKey).toBe(first.idempotencyKey);
  expect(second).toEqual({ ...first, quote: 'synthetic-server-proof' });
  expect(JSON.stringify(first)).not.toContain('price');
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('storefront-cart')!).state.items.length)).toBe(0);
});

test('a forged success URL preserves the cart when the owned status is unpaid', async ({ page }) => {
  await fixtures(page);
  await page.goto('/checkout/success?order=' + orderId + '&paid=true');
  await expect(page.getByRole('heading', { name: 'پرداخت این سفارش هنوز تأیید نشده است' })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('storefront-cart')!).state.items.length)).toBe(1);
});

test('wallet server gates stay closed despite a large cached balance', async ({ page }) => {
  const fixture = await fixtures(page);
  await page.goto('/account/wallet');
  await expect(page.getByText('۱۰٬۰۰۰ ریال', { exact: true })).toBeVisible();
  await expect(page.getByText('شارژ جدید کیف پول موقتاً غیرفعال است.')).toBeVisible();
  await expect(page.getByLabel('مبلغ شارژ (ریال)')).toHaveCount(0);
  expect(fixture.calls.some(call => call.path === '/api/bitpay/wallet-init')).toBe(false);
});

test('admin role denial cannot render the protected dashboard', async ({ page }) => {
  const fixture = await fixtures(page);
  await page.goto('/admin');
  await expect(page).toHaveURL('http://127.0.0.1:4179/');
  await expect(page.getByRole('heading', { name: 'داشبورد' })).toHaveCount(0);
  expect(fixture.calls.some(call => call.path === '/rest/v1/rpc/has_role')).toBe(true);
});


test('sign-in resumes the verification callback without losing provider parameters', async ({ page }) => {
  const fixture = await fixtures(page, { signedIn: false });
  const callback = '/checkout/verify?order_id=' + orderId + '&trans_id=synthetic-trans&id_get=synthetic-ref';
  await page.goto('/signin?returnTo=' + encodeURIComponent(callback));
  await page.getByLabel('شماره موبایل', { exact: true }).fill('09110000001');
  await page.getByLabel('رمز عبور', { exact: true }).fill('synthetic-password');
  await page.getByRole('button', { name: 'ورود', exact: true }).click();
  await expect(page.getByRole('heading', { name: 'پرداخت این سفارش هنوز تأیید نشده است' })).toBeVisible();
  expect(fixture.calls.find(call => call.path === '/api/bitpay/verify')?.body).toEqual({ order_id: orderId, trans_id: 'synthetic-trans', id_get: 'synthetic-ref' });
});

test('a failed address deletion reports failure and preserves the owned address', async ({ page }) => {
  await fixtures(page, { failAddressDelete: true });
  await page.goto('/account/addresses');
  const remove = page.getByRole('button', { name: 'Delete address' });
  await remove.click();
  await expect(page.getByText('حذف این آدرس انجام نشد.', { exact: true })).toBeVisible();
  await expect(remove).toBeEnabled();
  await expect(page.getByText('خانه آزمایشی', { exact: true })).toBeVisible();
});

test('dashboard query errors show a retry instead of fabricated zero statistics', async ({ page }) => {
  await fixtures(page, { admin: true, failDashboardOnce: true });
  await page.goto('/admin');
  await expect(page.getByRole('alert')).toContainText('دریافت آمار ممکن نیست.');
  await page.getByRole('button', { name: 'بررسی دوباره', exact: true }).click();
  await expect(page.getByText('مبلغ کل سفارش‌ها', { exact: true })).toBeVisible();
  await expect(page.getByRole('alert')).toHaveCount(0);
});


test('catalog options produce the same cart selection without treating a display variant as inventory', async ({ page }) => {
  await fixtures(page);
  await page.goto('/product/phase-three-fixture');
  await expect(page.getByRole('heading', { name: 'کالای آزمایشی فاز سه', exact: true })).toBeVisible();
  await page.getByRole('button', { name: 'افزودن به سبد خرید', exact: true }).click();
  await expect.poll(() => page.evaluate(() => JSON.parse(localStorage.getItem('storefront-cart')!).state.items[0].quantity)).toBe(2);
  await page.locator('a[aria-label="Shopping cart"]:visible').click();
  await expect(page.getByRole('heading', { name: 'سبد خرید', exact: true })).toBeVisible();
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem('storefront-cart')!).state.items[0].selectedSize)).toBe('M');
});

test('a refused catalog read offers retry without redirecting to not found', async ({ page }) => {
 await fixtures(page, { failCatalogOnce: true }); await page.goto('/product/phase-three-fixture');
 await expect(page.getByRole('alert')).toContainText('دریافت محصولات ممکن نیست.');
 await expect(page).toHaveURL(/\/product\/phase-three-fixture$/);
 await page.getByRole('button', { name: 'بررسی دوباره محصولات', exact: true }).click();
 await expect(page.getByRole('heading', { name: 'کالای آزمایشی فاز سه', exact: true })).toBeVisible();
});
test('order transport refusal is distinct from an empty order list and can be retried', async ({ page }) => {
 await fixtures(page, { failOrdersOnce: true }); await page.goto('/account/orders');
 await expect(page.getByRole('alert')).toContainText('دریافت اطلاعات انجام نشد.');
 await expect(page.getByText('هنوز سفارشی وجود ندارد', { exact: true })).toHaveCount(0);
 await page.getByRole('button', { name: 'تلاش دوباره', exact: true }).click();
 await expect(page.getByText('هنوز سفارشی وجود ندارد', { exact: true })).toBeVisible();
});
test('a failed global signout never announces success even when the SDK clears its local session', async ({ page }) => {
 await fixtures(page, { failLogout: true }); await page.goto('/account');
 await page.getByRole('button', { name: 'خروج از حساب', exact: true }).click();
 await expect(page.getByText('تکمیل خروج از حساب تأیید نشد. اتصال را بررسی کنید.', { exact: true })).toBeVisible();
 // The installed SDK removes its local session on this error; do not restore a cached account.
 await expect(page.getByRole('heading', { name: 'اطلاعات شخصی', exact: true })).toHaveCount(0);
 await expect(page.getByText('شما خارج شدید', { exact: true })).toHaveCount(0);
});

test('admin tickets distinguish read refusal, retry and a persisted status change', async ({ page }) => {
 await fixtures(page, { admin: true }); let reads = 0, status = 'pending', writes = 0;
 await page.route('**/rest/v1/tickets*', async route => {
  const req = route.request();
  if (req.method() === 'PATCH') { throw Error('Legacy direct ticket mutation attempted'); }
  reads++; await route.fulfill({ status: reads === 1 ? 403 : 200, contentType: 'application/json', body: JSON.stringify(reads === 1 ? { code: '42501', message: 'Synthetic refusal' } : [{ id: addressId, first_name: 'کاربر', last_name: 'آزمایشی', email: null, subject: 'تیکت ساختگی', message: 'متن ساختگی', status, created_at: user.createdAt }]) });
 });
 await page.route('**/api/admin/erp/operation',async route=>{expect(route.request().method()).toBe('POST');const body=route.request().postDataJSON();expect(body).toMatchObject({resource:'ticket',entityId:addressId,expected:'pending',next:'resolved',reason:'support browser review'});writes++;status=body.next;await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...body,id:orderId,actorId:owner,requestId:body.idempotencyKey,createdAt:'2026-10-25T12:00:00.123456Z'})});});
 await page.goto('/admin/tickets'); await expect(page.getByRole('alert')).toBeVisible();
 await expect(page.getByText('هیچ تیکتی یافت نشد', { exact: true })).toHaveCount(0);
 await page.getByRole('button', { name: 'تلاش دوباره', exact: true }).click();
 await page.getByRole('button', { name: 'انتقال به رسیدگی‌شده', exact: true }).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('دلیل عملیات').fill('support browser review');await dialog.getByRole('button',{name:'پیش‌نمایش عملیات',exact:true}).click();expect(writes).toBe(0);await dialog.getByRole('button',{name:'تأیید و ثبت عملیات',exact:true}).click();await expect(dialog.getByText('ثبت عملیات تأیید شد.',{exact:true})).toBeVisible();await dialog.getByRole('button',{name:'بستن عملیات',exact:true}).click();await expect(page.getByRole('button',{name:'انتقال به در انتظار',exact:true})).toBeVisible();expect(writes).toBe(1);
});

test('closing and reopening a product form prevents an old save from clearing the new draft', async ({ page }) => {
 await fixtures(page, { admin: true }); let release!: () => void; const gate = new Promise<void>(r => { release = r; }); let writes = 0;
 await page.route('**/rest/v1/products*', async route => {
  if (route.request().method() !== 'POST') { await route.fallback(); return; }
  writes++; await gate; await route.fulfill({ status: 201, contentType: 'application/json', body: 'null' });
 });
 await page.goto('/admin/products'); await page.getByRole('button', { name: 'افزودن محصول', exact: true }).click();
 await page.getByPlaceholder('Product name', { exact: true }).fill('اولین کالای ساختگی');
 await page.getByRole('button', { name: 'ذخیره محصول', exact: true }).click(); await expect.poll(() => writes).toBe(1);
 await expect(page.getByPlaceholder('Product name', { exact: true })).toBeDisabled();
 await page.keyboard.press('Escape'); await expect(page.getByRole('dialog')).toHaveCount(0);
 await page.getByRole('button', { name: 'افزودن محصول', exact: true }).click();
 await page.getByPlaceholder('Product name', { exact: true }).fill('پیش‌نویس جدید'); release();
 await expect(page.getByRole('dialog')).toBeVisible(); await expect(page.getByPlaceholder('Product name', { exact: true })).toHaveValue('پیش‌نویس جدید');
 await expect(page.getByText('محصول با موفقیت ایجاد شد', { exact: true })).toHaveCount(0);
});

test('a rejected product save preserves its draft and restores the submit control', async ({ page }) => {
 await fixtures(page, { admin: true }); let writes = 0;
 await page.route('**/rest/v1/products*', async route => {
  if (route.request().method() !== 'POST') { await route.fallback(); return; }
  writes++; await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'Synthetic product refusal' }) });
 });
 await page.goto('/admin/products'); await page.getByRole('button', { name: 'افزودن محصول', exact: true }).click();
 await page.getByPlaceholder('Product name', { exact: true }).fill('کالای ردشده');
 await page.getByRole('button', { name: 'ذخیره محصول', exact: true }).click();
 await expect(page.getByRole('button', { name: 'ذخیره محصول', exact: true })).toBeEnabled();
 await expect(page.getByText('Synthetic product refusal', { exact: true })).toBeVisible();
 await expect(page.getByPlaceholder('Product name', { exact: true })).toHaveValue('کالای ردشده'); expect(writes).toBe(1);
});

test('admin message submission preserves a rejected draft and resets only after success', async ({ page }) => {
 await fixtures(page, { admin: true }); let writes = 0; const history: object[] = [];
 await page.route('**/rest/v1/user_messages*', async route => {
  const req = route.request();
  if (req.method() === 'POST') {
   writes++; const body = req.postDataJSON(); if (writes > 1) history.push({ ...body, id: 'message-fixture', is_read: false, created_at: user.createdAt });
   await route.fulfill({ status: writes === 1 ? 403 : 201, contentType: 'application/json', body: JSON.stringify(writes === 1 ? { code: '42501', message: 'Synthetic refusal' } : null) }); return;
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(history), headers: { 'content-range': '*/0' } });
 });
 await page.goto('/admin/messages'); await page.getByRole('combobox').click(); await page.getByRole('option').first().click();
 await page.getByLabel('عنوان پیام', { exact: true }).fill('پیام ساختگی'); await page.getByLabel('متن پیام', { exact: true }).fill('متن آزمایشی بدون ارسال واقعی');
 await page.getByRole('button', { name: 'ارسال پیام', exact: true }).click(); await expect(page.getByText('خطا در ارسال پیام', { exact: true })).toBeVisible();
 await expect(page.getByLabel('عنوان پیام', { exact: true })).toHaveValue('پیام ساختگی');
 await page.getByRole('button', { name: 'ارسال پیام', exact: true }).click();
 await expect(page.getByLabel('عنوان پیام', { exact: true })).toHaveValue(''); await expect(page.getByRole('cell', { name: 'پیام ساختگی', exact: true })).toBeVisible(); expect(writes).toBe(2);
});

test('return-request order loading offers explicit retry after a denied read', async ({ page }) => {
 await fixtures(page); let reads = 0;
 await page.route('**/rest/v1/orders*', async route => {
  reads++; await route.fulfill({ status: reads === 1 ? 403 : 200, contentType: 'application/json', body: JSON.stringify(reads === 1 ? { code: '42501', message: 'Synthetic refusal' } : [{ id: orderId, created_at: user.createdAt }]) });
 });
 await page.goto('/account/returns/new'); await expect(page.getByRole('alert')).toContainText('خطا در دریافت سفارشات');
 await page.getByRole('button', { name: 'تلاش دوباره', exact: true }).click();
 await expect(page.getByRole('combobox')).toBeVisible(); await expect(page.getByRole('alert')).toHaveCount(0); expect(reads).toBe(2);
});

test('two tabs serialize cart saves and an older acknowledgement never erases a newer selection', async ({ page, context }) => {
 const shared: SharedCartFixture = { items: [item], writes: [], active: 0, maximum: 0 };
 let release!: () => void; const gate = new Promise<void>(r => { release = r; }); let first = true;
 shared.beforeWrite = async () => { if (first) { first = false; await gate; } };
 await fixtures(page, {}, shared); await page.goto('/cart'); await expect(page.getByRole('spinbutton')).toHaveValue('1');
 const other = await context.newPage(); await fixtures(other, { reuseStorage: true }, shared); await other.goto('/cart'); await expect(other.getByRole('spinbutton')).toHaveValue('1');
 try {
  await page.getByRole('button', { name: 'افزایش تعداد', exact: true }).click(); await expect.poll(() => shared.writes).toEqual([2]);
  await expect(other.getByRole('spinbutton')).toHaveValue('2'); await other.getByRole('button', { name: 'افزایش تعداد', exact: true }).click();
  await expect(page.getByRole('spinbutton')).toHaveValue('3'); expect(shared.writes).toEqual([2]);
  release(); await expect.poll(() => shared.items[0].quantity).toBe(3);
  await expect(other.getByRole('spinbutton')).toHaveValue('3'); expect(shared.maximum).toBe(1); expect(shared.writes).toEqual([2, 3]);
 } finally { release(); await other.close(); }
});

test('an offline owner edit survives closing its tab and wins over an older server cart on reconnect', async ({ page, context }) => {
 const shared: SharedCartFixture = { items: [item], writes: [], active: 0, maximum: 0 };
 await fixtures(page, { reuseStorage: true }, shared); await page.goto('/cart'); await expect(page.getByRole('spinbutton')).toHaveValue('1');
 await context.setOffline(true); await page.getByRole('button', { name: 'افزایش تعداد', exact: true }).click();
 await expect(page.getByRole('status')).toContainText('اتصال قطع است');
 await expect.poll(() => page.evaluate(owner => {
  const key = Object.keys(localStorage).find(key => key.includes(':cart-v1:' + owner) && !key.endsWith(':ack'));
  return key ? JSON.parse(localStorage.getItem(key)!).items[0]?.quantity : null;
 }, owner)).toBe(2);
 expect(shared.writes).toHaveLength(0); await page.close(); await context.setOffline(false);
 const resumed = await context.newPage(); await fixtures(resumed, { reuseStorage: true }, shared); await resumed.goto('/cart');
 await expect(resumed.getByRole('spinbutton')).toHaveValue('2'); await expect.poll(() => shared.items[0].quantity).toBe(2);
 expect(shared.writes).toEqual([2]); await resumed.close();
});

test('a denied initial cart read is retried explicitly without replacing intervening local edits', async ({ page }) => {
 const shared: SharedCartFixture = { items: [item], writes: [], active: 0, maximum: 0 };
 await fixtures(page, {}, shared); let reads = 0;
 await page.route('**/rest/v1/carts*', async route => {
  if (route.request().method() !== 'GET') { await route.fallback(); return; }
  reads++; if (reads > 1) { await route.fallback(); return; }
  await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'Synthetic refusal' }) });
 });
 await page.goto('/cart'); await expect(page.getByRole('status')).toContainText('همگام‌سازی سبد انجام نشد');
 await page.getByRole('button', { name: 'افزایش تعداد', exact: true }).click();
 await page.getByRole('button', { name: 'بررسی دوبارهٔ همگام‌سازی', exact: true }).click();
 await expect(page.getByRole('spinbutton')).toHaveValue('2'); await expect.poll(() => shared.items[0].quantity).toBe(2); expect(shared.writes).toEqual([2]);
});

test('a browser without shared locks keeps its local cart and reports unavailable sync without a concurrent write fallback', async ({ page }) => {
 await page.addInitScript(() => Object.defineProperty(navigator, 'locks', { configurable: true, value: undefined }));
 const shared: SharedCartFixture = { items: [item], writes: [], active: 0, maximum: 0 };
 await fixtures(page, {}, shared); await page.goto('/cart');
 await expect(page.getByRole('status')).toContainText('در این مرورگر در دسترس نیست');
 await page.getByRole('button', { name: 'افزایش تعداد', exact: true }).click(); await expect(page.getByRole('spinbutton')).toHaveValue('2'); expect(shared.writes).toEqual([]);
});

test('signout from one tab flushes the shared latest cart and clears the other tab without publishing an empty cart', async ({ page, context }) => {
 const shared: SharedCartFixture = { items: [item], writes: [], active: 0, maximum: 0 };
 await fixtures(page, {}, shared); await page.goto('/account');
 const other = await context.newPage(); await fixtures(other, { reuseStorage: true }, shared); await other.goto('/cart');
 await other.getByRole('button', { name: 'افزایش تعداد', exact: true }).click();
 await expect.poll(() => other.evaluate(owner => {
  const key = Object.keys(localStorage).find(key => key.includes(':cart-v1:' + owner) && !key.endsWith(':ack'));
  return key ? JSON.parse(localStorage.getItem(key)!).items[0]?.quantity : null;
 }, owner)).toBe(2);
 await page.getByRole('button', { name: 'خروج از حساب', exact: true }).click();
 await expect(other.getByText('شما هیچ محصولی در سبد خرید خود ندارید.', { exact: true })).toBeVisible();
 expect(shared.items[0]?.quantity).toBe(2); expect(shared.writes).not.toContain(0); await other.close();
});


test('admin bulk status requires preview and persists only the explicitly selected product', async ({ page }) => {
 const fixture = await fixtures(page, { admin: true });
 const products = [{ id: productId, name: 'محصول گروهی اول', slug: 'batch-first', price: 7000, is_active: true },
  { id: '82000000-0000-4000-8000-000000000002', name: 'محصول گروهی دوم', slug: 'batch-second', price: 8000, is_active: true }];
 const writes: string[] = [];
 await page.route('**/rest/v1/products*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (request.method() === 'PATCH') {
   const body = request.postDataJSON(); expect(body).toEqual({ is_active: false });
   expect(url.searchParams.get('is_active')).toBe('eq.true');
   const row = products.find(product => 'eq.' + product.id === url.searchParams.get('id'))!;
   expect(row?.id).toBe(productId); writes.push(row.id); row.is_active = body.is_active;
   await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: row.id, is_active: row.is_active }) }); return;
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products) });
 });
 await page.goto('/admin/products');
 await page.getByLabel('انتخاب محصول گروهی اول', { exact: true }).check();
 await page.getByRole('button', { name: 'پیش‌نمایش تغییر وضعیت', exact: true }).click();
 await expect(page.getByRole('dialog')).toBeVisible(); expect(writes).toEqual([]);
 await page.getByRole('button', { name: 'انصراف', exact: true }).click(); expect(writes).toEqual([]);
 await page.getByRole('button', { name: 'پیش‌نمایش تغییر وضعیت', exact: true }).click();
 await page.getByRole('button', { name: 'تأیید و اعمال وضعیت', exact: true }).click();
 await expect(page.getByRole('row').filter({ hasText: 'محصول گروهی اول' })).toContainText('پیش‌نویس');
 await expect(page.getByRole('row').filter({ hasText: 'محصول گروهی دوم' })).toContainText('فعال');
 expect(writes).toEqual([productId]); expect(fixture.blocked).toEqual([]);
});

test('admin bulk status stops after refusal and reports persisted partial results', async ({ page }) => {
 await fixtures(page, { admin: true });
 const products = [1, 2, 3].map(index => ({ id: '83000000-0000-4000-8000-' + String(index).padStart(12, '0'), name: 'محصول جزئی ' + index, slug: 'partial-' + index, price: 7000, is_active: true }));
 const writes: string[] = [];
 await page.route('**/rest/v1/products*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (request.method() === 'PATCH') {
   const row = products.find(product => 'eq.' + product.id === url.searchParams.get('id'))!; writes.push(row.id);
   if (row === products[1]) { await route.fulfill({ status: 403, contentType: 'application/json', body: JSON.stringify({ code: '42501', message: 'Synthetic status refusal' }) }); return; }
   row.is_active = false; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: row.id, is_active: false }) }); return;
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products) });
 });
 await page.goto('/admin/products'); await expect(page.getByLabel('انتخاب محصول جزئی 1')).toBeVisible();
 await page.getByLabel('انتخاب محصولات نمایش‌داده‌شده', { exact: true }).check();
 await page.getByRole('button', { name: 'پیش‌نمایش تغییر وضعیت', exact: true }).click();
 await page.getByRole('button', { name: 'تأیید و اعمال وضعیت', exact: true }).click();
 await expect(page.getByText('1 تغییر تأیید شد؛ 0 مورد از قبل همین وضعیت را داشت.', { exact: true })).toBeVisible();
 await expect(page.getByText(/نتیجهٔ 1 مورد تأیید نشد؛ 1 مورد بعدی اجرا نشد/)).toBeVisible();
 expect(writes).toEqual([products[0].id, products[1].id]); expect(products[2].is_active).toBe(true);
});


test('admin bulk price preview applies only selected base prices after confirmation', async ({ page }) => {
 await fixtures(page, { admin: true });
 const products = [{ id: productId, name: 'قیمت گروهی اول', slug: 'price-first', price: 7000, is_active: true }, { id: '85000000-0000-4000-8000-000000000002', name: 'قیمت گروهی دوم', slug: 'price-second', price: 8000, is_active: true }];
 const writes: object[] = [];
 await page.route('**/rest/v1/products*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (request.method() === 'PATCH') {
   const body = request.postDataJSON(); expect(body).toEqual({ price: 50000 }); expect(url.searchParams.get('price')).toBe('eq.7000');
   expect(url.searchParams.get('id')).toBe('eq.' + productId); writes.push(body); products[0].price = body.price;
   await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: productId, price: body.price }) }); return;
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products) });
 });
 await page.goto('/admin/products'); await page.getByLabel('انتخاب قیمت گروهی اول', { exact: true }).check();
 await page.getByLabel('مقدار تغییر قیمت', { exact: true }).fill('۵۰۰۰۰');
 await page.getByRole('button', { name: 'پیش‌نمایش تغییر قیمت', exact: true }).click();
 await expect(page.getByRole('dialog')).toContainText('۷٬۰۰۰ ریال'); await expect(page.getByRole('dialog')).toContainText('۵۰٬۰۰۰ ریال'); expect(writes).toEqual([]);
 await page.getByRole('button', { name: 'تأیید و اعمال قیمت', exact: true }).click();
 await expect(page.getByRole('row').filter({ hasText: 'قیمت گروهی اول' })).toContainText('۵۰٬۰۰۰ ریال');
 await expect(page.getByRole('row').filter({ hasText: 'قیمت گروهی دوم' })).toContainText('۸٬۰۰۰ ریال'); expect(writes).toEqual([{ price: 50000 }]);
});

test('a concurrent price edit refuses the old preview without rewriting it or dispatching later rows', async ({ page }) => {
 await fixtures(page, { admin: true });
 const products = [{ id: productId, name: 'قیمت همزمان اول', slug: 'concurrent-first', price: 7000, is_active: true }, { id: '86000000-0000-4000-8000-000000000002', name: 'قیمت همزمان دوم', slug: 'concurrent-second', price: 8000, is_active: true }];
 let writes = 0;
 await page.route('**/rest/v1/products*', async route => {
  if (route.request().method() === 'PATCH') {
   writes++; expect(new URL(route.request().url()).searchParams.get('price')).toBe('eq.7000');
   await route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: 'Synthetic concurrent price edit' }) }); return;
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products) });
 });
 await page.goto('/admin/products'); await expect(page.getByLabel('انتخاب قیمت همزمان اول')).toBeVisible();
 await page.getByLabel('انتخاب محصولات نمایش‌داده‌شده', { exact: true }).check();
 await page.getByLabel('روش تغییر قیمت گروهی').selectOption('increase'); await page.getByLabel('مقدار تغییر قیمت').fill('10');
 await page.getByRole('button', { name: 'پیش‌نمایش تغییر قیمت', exact: true }).click();
 await expect(page.getByRole('dialog')).toContainText('۷٬۷۰۰ ریال'); products[0].price = 11000;
 await page.getByRole('button', { name: 'تأیید و اعمال قیمت', exact: true }).click();
 await expect(page.getByText(/نتیجهٔ 1 مورد تأیید نشد؛ 1 مورد بعدی اجرا نشد/)).toBeVisible();
 await expect(page.getByRole('row').filter({ hasText: 'قیمت همزمان اول' })).toContainText('۱۱٬۰۰۰ ریال'); expect(writes).toBe(1); expect(products[1].price).toBe(8000);
});


test('admin category preview keeps classifications separate and updates only selected products', async ({ page }) => {
 await fixtures(page, { admin: true });
 const oldCategory = '88000000-0000-4000-8000-000000000100', newCategory = '88000000-0000-4000-8000-000000000101';
 const products = [1, 2].map(index => ({ id: '88000000-0000-4000-8000-' + String(index).padStart(12, '0'), name: 'دسته گروهی ' + index, slug: 'category-' + index, price: 7000, is_active: true, department: 'men', category: 'socks', category_id: oldCategory }));
 const writes: object[] = []; let categoryReads = 0;
 await page.route('**/rest/v1/categories*', async route => { categoryReads++; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify([{ id: oldCategory, name: 'کاتالوگ قدیمی', slug: 'unrelated-old' }, { id: newCategory, name: 'کاتالوگ تازه', slug: 'unrelated-new' }]) }); });
 await page.route('**/rest/v1/products*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (request.method() === 'PATCH') {
   const body = request.postDataJSON(); expect(body).toEqual({ department: 'women', category: 't-shirts', category_id: newCategory });
   expect(url.searchParams.get('id')).toBe('eq.' + products[0].id); expect(url.searchParams.get('department')).toBe('eq.men'); expect(url.searchParams.get('category')).toBe('eq.socks'); expect(url.searchParams.get('category_id')).toBe('eq.' + oldCategory);
   writes.push(body); Object.assign(products[0], body); await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products[0]) }); return;
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products) });
 });
 await page.goto('/admin/products'); await page.getByLabel('انتخاب دسته گروهی 1', { exact: true }).check(); expect(categoryReads).toBe(0);
 await page.getByRole('button', { name: 'ویرایش گروهی دسته‌بندی', exact: true }).click();
 await page.getByLabel('بخش فروشگاه گروهی').selectOption('women'); await page.getByLabel('نوع محصول در فیلترها گروهی').selectOption('t-shirts'); await page.getByLabel('دستهٔ کاتالوگ گروهی').selectOption(newCategory);
 await page.getByRole('button', { name: 'پیش‌نمایش تغییر دسته‌بندی', exact: true }).click(); await expect(page.getByRole('dialog')).toContainText('کاتالوگ تازه'); expect(writes).toEqual([]);
 await page.getByRole('button', { name: 'تأیید و اعمال دسته‌بندی', exact: true }).click();
 await expect(page.getByRole('row').filter({ hasText: 'دسته گروهی 1' })).toContainText('زنانه / تی‌شرت'); await expect(page.getByRole('row').filter({ hasText: 'دسته گروهی 2' })).toContainText('مردانه / جوراب'); expect(writes).toHaveLength(1); expect(categoryReads).toBe(2);
});

test('a concurrent category edit refuses a stale preview and preserves unrelated classification', async ({ page }) => {
 await fixtures(page, { admin: true });
 const products = [1, 2].map(index => ({ id: '89000000-0000-4000-8000-' + String(index).padStart(12, '0'), name: 'دسته همزمان ' + index, slug: 'concurrent-category-' + index, price: 7000, is_active: true, department: 'men', category: 'socks', category_id: null }));
 let writes = 0;
 await page.route('**/rest/v1/categories*', route => route.fulfill({ status: 200, contentType: 'application/json', body: '[]' }));
 await page.route('**/rest/v1/products*', async route => {
  if (route.request().method() === 'PATCH') {
   writes++; const url = new URL(route.request().url()); expect(route.request().postDataJSON()).toEqual({ department: 'women' }); expect(url.searchParams.get('category_id')).toBe('is.null'); expect(url.searchParams.get('category')).toBe('eq.socks');
   await route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: 'Synthetic concurrent category edit' }) }); return;
  }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products) });
 });
 await page.goto('/admin/products'); await expect(page.getByLabel('انتخاب دسته همزمان 1')).toBeVisible(); await page.getByLabel('انتخاب محصولات نمایش‌داده‌شده', { exact: true }).check();
 await page.getByRole('button', { name: 'ویرایش گروهی دسته‌بندی', exact: true }).click(); await page.getByLabel('بخش فروشگاه گروهی').selectOption('women');
 await page.getByRole('button', { name: 'پیش‌نمایش تغییر دسته‌بندی', exact: true }).click(); products[0].category = 'pants';
 await page.getByRole('button', { name: 'تأیید و اعمال دسته‌بندی', exact: true }).click();
 await expect(page.getByText(/نتیجهٔ 1 مورد تأیید نشد؛ 1 مورد بعدی اجرا نشد/)).toBeVisible(); await expect(page.getByRole('row').filter({ hasText: 'دسته همزمان 1' })).toContainText('مردانه / شلوار'); expect(writes).toBe(1); expect(products[1].department).toBe('men');
});


test('admin image preview changes only selected cover/order/references without deleting stored files', async ({ page }) => {
 await fixtures(page, { admin: true });
 const a = '/placeholder.svg?photo=a', b = '/placeholder.svg?photo=b', c = '/placeholder.svg?photo=c';
 const products = [1, 2].map(index => ({ id: '91000000-0000-4000-8000-' + String(index).padStart(12, '0'), name: 'تصویر گروهی ' + index, slug: 'image-batch-' + index, price: 7000, is_active: true, images: [a, b, c] }));
 let writes = 0, storageDeletes = 0;
 await page.route('**/storage/v1/**', async route => { if (route.request().method() === 'DELETE') storageDeletes++; await route.fulfill({ status: 400, body: '{}' }); });
 await page.route('**/rest/v1/products*', async route => {
  const request = route.request(), url = new URL(request.url());
  if (request.method() === 'PATCH') { writes++; expect(url.searchParams.get('id')).toBe('eq.' + products[0].id); expect(url.searchParams.get('images')).toBe('eq.{' + [a, b, c].map(value => JSON.stringify(value)).join(',') + '}'); expect(request.postDataJSON()).toEqual({ images: [b, a] }); products[0].images = [b, a]; await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify({ id: products[0].id, images: [b, a] }) }); return; }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products) });
 });
 await page.goto('/admin/products'); await page.getByLabel('انتخاب تصویر گروهی 1', { exact: true }).check(); await page.getByRole('button', { name: 'ویرایش گروهی تصاویر', exact: true }).click();
 await page.getByLabel('اصلی‌کردن عکس 2 تصویر گروهی 1', { exact: true }).click(); await page.getByLabel('حذف از نمایش عکس 3 تصویر گروهی 1', { exact: true }).click();
 await page.getByRole('button', { name: 'پیش‌نمایش تغییر تصاویر', exact: true }).click(); const after = page.getByRole('dialog').getByLabel('بعد تصویر گروهی 1', { exact: true }); await expect(after.locator('img').first()).toHaveAttribute('src', b); expect(writes).toBe(0);
 await page.getByRole('button', { name: 'تأیید و اعمال تصاویر', exact: true }).click(); await expect(page.getByText('1 تغییر تأیید شد؛ 0 مورد نیازی به تغییر تصاویر نداشت.', { exact: true })).toBeVisible();
 expect(writes).toBe(1); expect(storageDeletes).toBe(0); expect(products[1].images).toEqual([a, b, c]);
});

test('a concurrent image reorder rejects the frozen array instead of losing another edit', async ({ page }) => {
 await fixtures(page, { admin: true }); const a = '/placeholder.svg?photo=a', b = '/placeholder.svg?photo=b';
 const products = [1, 2].map(index => ({ id: '92000000-0000-4000-8000-' + String(index).padStart(12, '0'), name: 'تصویر همزمان ' + index, slug: 'concurrent-image-' + index, price: 7000, is_active: true, images: [a, b] })); let writes = 0;
 await page.route('**/rest/v1/products*', async route => {
  if (route.request().method() === 'PATCH') { writes++; expect(new URL(route.request().url()).searchParams.get('images')).toBe('eq.{' + [a, b].map(value => JSON.stringify(value)).join(',') + '}'); await route.fulfill({ status: 406, contentType: 'application/json', body: JSON.stringify({ code: 'PGRST116', message: 'Synthetic image order conflict' }) }); return; }
  await route.fulfill({ status: 200, contentType: 'application/json', body: JSON.stringify(products) });
 });
 await page.goto('/admin/products'); await expect(page.getByLabel('انتخاب تصویر همزمان 1')).toBeVisible(); await page.getByLabel('انتخاب محصولات نمایش‌داده‌شده', { exact: true }).check(); await page.getByRole('button', { name: 'ویرایش گروهی تصاویر', exact: true }).click();
 await page.getByLabel('اصلی‌کردن عکس 2 تصویر همزمان 1', { exact: true }).click(); await page.getByLabel('اصلی‌کردن عکس 2 تصویر همزمان 2', { exact: true }).click();
 await page.getByRole('button', { name: 'پیش‌نمایش تغییر تصاویر', exact: true }).click(); products[0].images = [b, a];
 await page.getByRole('button', { name: 'تأیید و اعمال تصاویر', exact: true }).click(); await expect(page.getByText(/نتیجهٔ 1 مورد تأیید نشد؛ 1 مورد بعدی اجرا نشد/)).toBeVisible(); expect(writes).toBe(1); expect(products[0].images).toEqual([b, a]); expect(products[1].images).toEqual([a, b]);
});


for (const uncertain of [false, true]) test('fresh image files map to each product with ' + (uncertain ? 'an uncertain metadata response' : 'confirmed append-only galleries'), async ({ page }) => {
 await fixtures(page, { admin: true });
 const products = [1,2].map(index=>({ id:'95000000-0000-4000-8000-'+String(index).padStart(12,'0'), name:'بارگذاری تازه '+index, slug:'fresh-upload-'+index, price:7000,is_active:true,images:['/placeholder.svg?old='+index],product_images:[] }));
 const uploads: string[] = [], writes: string[] = []; let deletes=0;
 const pixel=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+/daoAAAAASUVORK5CYII=','base64');
 await page.route('**/storage/v1/**',async route=>{
  const request=route.request(), url=new URL(request.url());
  if(request.method()==='POST') {
   const key=url.pathname.split('/object/product-images/')[1]; expect(key).toMatch(/^[a-f0-9-]+\.png$/); expect(request.headers()['x-upsert']).toBe('false');
   expect(await page.evaluate(key=>Object.values(localStorage).some(value=>{try{const note=JSON.parse(value);return note.path===key&&note.state==='upload-unconfirmed';}catch{return false;}}),key)).toBe(true);
   uploads.push(key); await route.fulfill({ status:200,contentType:'application/json',body:JSON.stringify({ Id:'synthetic-object',Key:'product-images/'+key }) }); return;
  }
  if(request.method()==='DELETE') deletes++;
  await route.fulfill({ status:200,contentType:'image/png',body:pixel });
 });
 await page.route('**/rest/v1/products*',async route=>{
  const request=route.request(), url=new URL(request.url());
  const selected=products.find(product=>'eq.'+product.id===url.searchParams.get('id'));
  if(request.method()==='PATCH') {
   expect(selected).toBeTruthy(); writes.push(selected!.id);
   expect(url.searchParams.get('images')).toBe('eq.{'+JSON.stringify(selected!.images[0])+'}');
   const body=request.postDataJSON(); expect(Object.keys(body)).toEqual(['images']); expect(body.images[0]).toBe(selected!.images[0]); expect(body.images[1]).toContain('/product-images/'+selected!.id+'-');
   if(uncertain) { await route.fulfill({ status:500,contentType:'application/json',body:JSON.stringify({ message:'Synthetic lost result' }) }); return; }
   selected!.images=body.images; await route.fulfill({ status:200,contentType:'application/json',body:JSON.stringify({ id:selected!.id,images:selected!.images }) }); return;
  }
  await route.fulfill({ status:200,contentType:'application/json',body:JSON.stringify(selected??products) });
 });
 await page.goto('/admin/products'); await expect(page.getByLabel('انتخاب بارگذاری تازه 1',{ exact:true })).toBeVisible();
 await page.getByLabel('انتخاب محصولات نمایش‌داده‌شده',{ exact:true }).check(); await page.getByRole('button',{ name:'بارگذاری گروهی عکس تازه',exact:true }).click();
 await page.getByLabel('فایل‌های تازه بارگذاری تازه 1',{ exact:true }).setInputFiles({ name:'first.png',mimeType:'image/png',buffer:pixel });
 await page.getByLabel('فایل‌های تازه بارگذاری تازه 2',{ exact:true }).setInputFiles({ name:'second.png',mimeType:'image/png',buffer:pixel });
 await page.getByRole('button',{ name:'پیش‌نمایش بارگذاری',exact:true }).click();
 await expect(page.getByRole('dialog')).toContainText('first.png'); await expect(page.getByRole('dialog')).toContainText('second.png'); expect(uploads).toEqual([]); expect(writes).toEqual([]);
 await page.getByRole('button',{ name:'انصراف',exact:true }).click(); expect(uploads).toEqual([]);
 await page.getByRole('button',{ name:'پیش‌نمایش بارگذاری',exact:true }).click(); await page.getByRole('button',{ name:'تأیید و بارگذاری عکس‌ها',exact:true }).click();
 await expect(page.getByText(uncertain?'0 محصول با عکس‌های تازه ثبت شد؛ 1 مورد تأیید نشد و 1 مورد اجرا نشد.':'2 محصول با عکس‌های تازه ثبت شد؛ 0 مورد تأیید نشد و 0 مورد اجرا نشد.',{ exact:true })).toBeVisible();
 expect(uploads).toHaveLength(uncertain?1:2); expect(writes).toEqual(uncertain?[products[0].id]:products.map(product=>product.id)); expect(deletes).toBe(0);
 if(uncertain) { await page.getByText('فایل‌های نیازمند بررسی؛ پیش از تلاش مجدد این گزارش را نگه دارید',{ exact:true }).click(); await expect(page.getByText(uploads[0],{ exact:true })).toBeVisible(); expect(products[1].images).toHaveLength(1); }
 else { expect(uploads[0]).toContain(products[0].id); expect(uploads[1]).toContain(products[1].id); expect(products.every(product=>product.images.length===2)).toBe(true); }
 await expect(page.getByRole('button',{ name:'پیش‌نمایش بارگذاری',exact:true })).toBeDisabled();
 await page.reload(); await page.locator('details.admin-recovery > summary').click();await page.getByRole('button',{name:'گالری قدیمی و بازیابی بارگذاری',exact:true}).click();
 await expect(page.getByText((uncertain?'1':'0')+' یادداشت نیازمند بررسی در این مرورگر',{exact:true})).toBeVisible();
 if(uncertain){
  await expect(page.getByText(uploads[0],{exact:true})).toBeVisible(); await page.getByRole('button',{name:'بررسی ارتباط فایل با محصول',exact:true}).click();
  await expect(page.getByText(/استفادهٔ احتمالی در محصولات دیگر هنوز بررسی نشده/)).toBeVisible(); expect(writes).toHaveLength(1); expect(deletes).toBe(0);
  await page.getByRole('button',{name:'بستن یادداشت پس از بررسی دستی',exact:true}).click(); await expect(page.getByText('0 یادداشت نیازمند بررسی در این مرورگر',{exact:true})).toBeVisible();expect(deletes).toBe(0);
 }
});


test('legacy gallery inspection shows actual fallback order and never changes product metadata',async({page})=>{
 await fixtures(page,{admin:true});let writes=0;
 const record={id:'97000000-0000-4000-8000-000000000001',name:'گالری قدیمی واقعی',slug:'legacy-gallery',price:7000,is_active:true,images:[],product_images:[{id:'legacy-b',image_url:'/placeholder.svg?legacy=b',sort_order:2},{id:'legacy-a',image_url:'/placeholder.svg?legacy=a',sort_order:1}]};
 await page.route('**/rest/v1/products*',async route=>{if(route.request().method()!=='GET')writes++;const selected=new URL(route.request().url()).searchParams.get('id');await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(selected?record:[record])});});
 await page.goto('/admin/products');await page.getByLabel('انتخاب گالری قدیمی واقعی',{exact:true}).check();await page.locator('details.admin-recovery > summary').click();await page.getByRole('button',{name:'گالری قدیمی و بازیابی بارگذاری',exact:true}).click();await page.getByRole('button',{name:'مشاهده گالری فعلی و قدیمی گالری قدیمی واقعی',exact:true}).click();
 await expect(page.getByText('فهرست اصلی خالی است؛ نمایش فعلی از گالری قدیمی است.',{exact:true})).toBeVisible();await expect(page.getByAltText('قدیمی 1',{exact:true})).toHaveAttribute('src','/placeholder.svg?legacy=a');expect(writes).toBe(0);
});


test('inventory shows page-local SKU stock warnings and guarded paginated reads',async({page})=>{
 await fixtures(page,{admin:true});let writes=0;const reads:number[]=[];
 const id=(n:number)=>'99000000-0000-4000-8000-'+String(n).padStart(12,'0');
 const products=Array.from({length:51},(_,index)=>({id:id(index+1),name:'کالای انبار '+(index+1),is_active:true,is_out_of_stock:false,product_variants:index===1?[]:[{id:id(index+101),product_id:id(index+1),sku:index===2?'DUP-12':index===3?'dup-۱۲':'SKU-'+(index+1),size:'M',color:'مشکی',stock_quantity:index===0?0:index===2?2:index===3?-1:12}]}));
 await page.route('**/rest/v1/products*',async route=>{const request=route.request(),url=new URL(request.url());if(request.method()!=='GET')writes++;const offset=Number(url.searchParams.get('offset')??0);reads.push(offset);const data=products.slice(offset,offset+50);await route.fulfill({status:200,contentType:'application/json',headers:{'content-range':`${offset}-${offset+data.length-1}/51`,'access-control-expose-headers':'content-range'},body:JSON.stringify(data)});});
 await page.goto('/admin/inventory');await expect(page.getByRole('heading',{name:'انبار و موجودی SKU',exact:true})).toBeVisible();await page.locator('details.admin-help > summary').click();await expect(page.getByText(/خلاصهٔ همین صفحه: 49 تنوع؛ 1 کمبود؛ 1 موجودی صفر؛ 1 موجودی نامعتبر؛ 1 محصول بدون تنوع/)).toBeVisible();
 await page.getByLabel('فیلتر انبار').selectOption('duplicate-sku');await expandInventoryRows(page);await expect(page.locator('.admin-inventory-child tr').filter({hasText:'DUP-12'})).toBeVisible();await expect(page.locator('.admin-inventory-child tr').filter({hasText:'dup-۱۲'})).toContainText('نامعتبر');
 await page.getByLabel('جست‌وجوی انبار در همین صفحه').fill('انبار 3');await expect(page.locator('.admin-inventory-child tr').filter({hasText:'DUP-12'})).toBeVisible();await expect(page.locator('.admin-inventory-child tr').filter({hasText:'dup-۱۲'})).toHaveCount(0);
 await page.getByRole('button',{name:'صفحهٔ بعدی انبار',exact:true}).click();await expect(page.getByText('کالای انبار 51',{exact:true})).toBeVisible();await expect(page.getByLabel('جست‌وجوی انبار در همین صفحه')).toHaveValue('');await expect(page.getByRole('button',{name:'صفحهٔ بعدی انبار',exact:true})).toBeDisabled();expect(reads).toContain(50);expect(writes).toBe(0);
});

test('inventory read denial offers retry and admin denial never opens the inventory',async({page})=>{
 await fixtures(page,{admin:true});let reads=0;
 await page.route('**/rest/v1/products*',async route=>{reads++;await route.fulfill({status:reads===1?403:200,contentType:'application/json',headers:reads===1?{}:{'content-range':'*/0','access-control-expose-headers':'content-range'},body:reads===1?JSON.stringify({code:'42501',message:'Synthetic inventory denial'}):'[]'});});
 await page.goto('/admin/inventory');await expect(page.getByRole('alert')).toContainText('خواندن انبار ممکن نشد');await expect(page.getByText(/خلاصهٔ همین صفحه/)).toHaveCount(0);await page.getByRole('button',{name:'تلاش دوباره',exact:true}).click();await expect(page.getByText('محصولی برای نمایش وجود ندارد.',{exact:true})).toBeVisible();expect(reads).toBe(2);
 await fixtures(page,{admin:false});await page.goto('/admin/inventory');await expect(page).toHaveURL('http://127.0.0.1:4179/');await expect(page.getByRole('heading',{name:'انبار و موجودی SKU',exact:true})).toHaveCount(0);
});


for(const mode of ['confirmed','uncertain','stale','disabled'])test('manual inventory adjustment '+mode+' keeps exact request identity and scoped history',async({page})=>{
 await fixtures(page,{admin:true});
 const product='a3000000-0000-4000-8000-000000000001',variant='a3000000-0000-4000-8000-000000000002',receiptId='a3000000-0000-4000-8000-000000000004';
 let quantity=10,entry:Record<string,unknown>|undefined;const writes:Record<string,unknown>[]=[];
 await page.route('**/rest/v1/products*',async route=>{expect(route.request().method()).toBe('GET');await route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-0/1','access-control-expose-headers':'content-range'},body:JSON.stringify([{id:product,name:'اصلاح انبار تستی',is_active:true,is_out_of_stock:false,product_variants:[{id:variant,product_id:product,sku:'SKU-adjust',size:'M',color:'red',stock_quantity:quantity}]}])});});
 await page.route('**/api/admin/inventory/**',async route=>{
  const request=route.request(),url=new URL(request.url());
  const reply=(data:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(data)});
  if(url.pathname.endsWith('/status')){await reply({version:1,adjustmentsEnabled:mode!=='disabled',historyAvailable:mode!=='disabled'});return;}
  if(url.pathname.endsWith('/history')){await reply({entries:entry?[entry]:[],hasMore:false,nextCursor:null});return;}
  expect(request.method()).toBe('POST');const body=request.postDataJSON();writes.push(body);
  expect(Object.keys(body).sort()).toEqual(['delta','expected','idempotencyKey','productId','reason','variantId']);expect(body.expected).toEqual({quantity:10,sku:'SKU-adjust',size:'M',color:'red'});
  expect(await page.evaluate(key=>Object.values(localStorage).some(value=>{try{return JSON.parse(value).request?.idempotencyKey===key;}catch{return false;}}),body.idempotencyKey)).toBe(true);
  if(mode==='stale'){quantity=7;await reply({code:'INVENTORY_STALE'},409);return;}
  if(!entry){quantity+=body.delta;entry={id:receiptId,requestId:body.idempotencyKey,actorId:owner,productId:product,variantId:variant,before:10,after:quantity,delta:body.delta,reason:body.reason,sku:'SKU-adjust',size:'M',color:'red',createdAt:'2026-10-24T01:00:00.123456Z'};}
  else expect(body).toEqual(writes[0]);
  if(mode==='uncertain'&&writes.length===1){await reply({code:'INVENTORY_RESULT_UNCONFIRMED'},503);return;}
  await reply({entry});
 });
 await page.goto('/admin/inventory');await expandInventoryRows(page);await page.getByRole('button',{name:'اصلاح و تاریخچه',exact:true}).click();
 if(mode==='disabled'){await expect(page.getByText('اصلاح موجودی هنوز فعال نشده است.',{exact:true})).toBeVisible();expect(writes).toEqual([]);await expect(page.getByLabel('افزایش یا کاهش موجودی')).toHaveCount(0);return;}
 await page.getByLabel('افزایش یا کاهش موجودی',{exact:true}).fill('-۲');await page.getByLabel('دلیل اصلاح موجودی',{exact:true}).fill('count correction');await page.getByRole('button',{name:'پیش‌نمایش اصلاح موجودی',exact:true}).click();await expect(page.getByText('قبل: 10؛ تغییر: -2؛ بعد: 8',{exact:true})).toBeVisible();expect(writes).toEqual([]);
 await page.getByRole('button',{name:'تأیید و ثبت اصلاح موجودی',exact:true}).click();
 if(mode==='stale'){
  await expect(page.getByText(/موجودی یا مشخصات تنوع تغییر کرده/)).toBeVisible();await expect(page.getByLabel('افزایش یا کاهش موجودی')).toHaveCount(0);await page.getByRole('button',{name:'بستن',exact:true}).click();await expect(page.locator('.admin-inventory-child tr').filter({hasText:'SKU-adjust'})).toContainText('۷');expect(writes).toHaveLength(1);expect(entry).toBeUndefined();return;
 }
 if(mode==='uncertain'){
  await expect(page.getByText(/درخواست ذخیره‌شده را با همان شناسه/)).toBeVisible();await page.reload();await expandInventoryRows(page);await page.getByRole('button',{name:'اصلاح و تاریخچه',exact:true}).click();
  await expect(page.getByText('قبل: 10؛ تغییر: -2؛ بعد: 8',{exact:true})).toBeVisible();await expect(page.getByLabel('افزایش یا کاهش موجودی')).toHaveCount(0);await page.getByRole('button',{name:'بررسی دوبارهٔ همین درخواست',exact:true}).click();
 }
 await expect(page.getByText('اصلاح موجودی تأیید شد: 10 ← 8',{exact:true})).toBeVisible();await page.getByRole('button',{name:'نمایش تاریخچهٔ اصلاحات دستی',exact:true}).click();await expect(page.getByText('10 ← 8؛ count correction',{exact:true})).toBeVisible();expect(quantity).toBe(8);expect(writes).toHaveLength(mode==='uncertain'?2:1);
 expect(await page.evaluate(()=>Object.keys(localStorage).filter(key=>key.startsWith('jami-inventory-pending-v1:')).length)).toBe(0);
});


test('saved product form creates only zero-stock variants and offers guarded adjustment instead of deletion', async ({ page }) => {
 await fixtures(page,{admin:true});const variants:object[]=[];const writes:Record<string,unknown>[]=[];
 await page.route('**/rest/v1/product_variants*',async route=>{
  const req=route.request();expect(req.method()).not.toBe('DELETE');expect(req.method()).not.toBe('PATCH');
  if(req.method()==='POST'){
   const body=req.postDataJSON();writes.push(body);
   expect(body).toEqual({product_id:productId,size:'M',color:null,sku:null,price:null});
   const variant={...body,id:'81000000-0000-4000-8000-000000000051',created_at:user.createdAt,stock_quantity:0};variants.push(variant);
   await route.fulfill({status:201,contentType:'application/json',body:JSON.stringify(variant)});return;
  }
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(variants)});
 });
 await page.route('**/api/admin/inventory/status',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:null,adjustmentsEnabled:false,historyAvailable:false})}));
 await page.goto('/admin/products');await page.locator('details.admin-help > summary').click();await expect(page.getByText('برای توقف فروش، محصول را پیش‌نویس کنید.',{exact:false})).toBeVisible();
 await page.getByRole('button',{name:'ویرایش محصول',exact:true}).click();
 await page.getByPlaceholder('سایز جدید',{exact:true}).fill('M');
 await page.getByRole('button',{name:'افزودن تنوع با موجودی صفر',exact:true}).click();
 await expect(page.getByText('حذف دائمی بسته است',{exact:true})).toBeVisible();expect(writes).toHaveLength(1);
 await page.getByRole('button',{name:'اصلاح و تاریخچه',exact:true}).click();
 await expect(page.getByText('اصلاح موجودی هنوز فعال نشده است.',{exact:true})).toBeVisible();
 await expect(page.getByLabel('افزایش یا کاهش موجودی',{exact:true})).toHaveCount(0);expect(writes).toHaveLength(1);
});


for(const mode of ['ready','disabled'])test('inventory balance report '+mode+' never subtracts reservations twice or writes stock',async({page})=>{
 await fixtures(page,{admin:true});const product='a4000000-0000-4000-8000-000000000001',variant='a4000000-0000-4000-8000-000000000002';let writes=0;
 await page.route('**/rest/v1/products*',async route=>{if(route.request().method()!=='GET')writes++;await route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-0/1','access-control-expose-headers':'content-range'},body:JSON.stringify([{id:product,name:'کالای گزارش رزرو',is_active:true,is_out_of_stock:false,product_variants:[{id:variant,product_id:product,sku:'SKU-report',size:'M',color:'red',stock_quantity:10}]}])});});
 await page.route('**/api/admin/inventory/balance?*',async route=>{expect(route.request().method()).toBe('GET');expect(route.request().postData()).toBeNull();await route.fulfill({status:mode==='ready'?200:503,contentType:'application/json',body:JSON.stringify(mode==='ready'?{version:1,productId:product,variantId:variant,available:8,reserved:'2',overdue:'1',paid:'9007199254740993',released:'3',legacy:'0',reviewLines:'1',saleEnabled:false,asOf:'2026-10-24T19:00:00.123456Z'}:{code:'INVENTORY_REPORTS_DISABLED'})});});
 await page.goto('/admin/inventory');await expandInventoryRows(page);await page.getByRole('button',{name:'تفکیک موجودی',exact:true}).click();
 const dialog=page.getByRole('dialog');
 if(mode==='ready'){
  await expect(dialog.getByText('۸',{exact:true})).toBeVisible();await expect(dialog.getByText('۶',{exact:true})).toHaveCount(0);
  await expect(dialog.getByText(BigInt('9007199254740993').toLocaleString('fa-IR'),{exact:true})).toBeVisible();
  await expect(dialog.getByText('پایان مهلت به‌تنهایی',{exact:false})).toBeVisible();await expect(dialog.getByText('ماندهٔ عددی به معنی مجازبودن فروش نیست.',{exact:false})).toBeVisible();
 }else{await expect(dialog.getByText('گزارش تفکیک موجودی هنوز فعال نشده است.',{exact:true})).toBeVisible();await expect(dialog.getByText('ماندهٔ جاری برای رزرو',{exact:true})).toHaveCount(0);}
 await dialog.getByRole('button',{name:'بستن گزارش',exact:true}).click();await expect(dialog).toHaveCount(0);expect(writes).toBe(0);
});


for(const mode of ['confirmed','uncertain','disabled'])test('saved low-stock policy '+mode+' persists per variant without editing stock',async({page})=>{
 await fixtures(page,{admin:true});const product='a5000000-0000-4000-8000-000000000001',variant='a5000000-0000-4000-8000-000000000002';let stockWrites=0,revision=0;const commands:Record<string,unknown>[]=[];let saved:Record<string,unknown>|null=null;
 await page.route('**/rest/v1/products*',async route=>{if(route.request().method()!=='GET')stockWrites++;await route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-0/1','access-control-expose-headers':'content-range'},body:JSON.stringify([{id:product,name:'کالای حد کمبود',is_active:true,is_out_of_stock:false,product_variants:[{id:variant,product_id:product,sku:'SKU-policy',size:'M',color:'red',stock_quantity:3}]}])});});
 await page.route('**/api/admin/inventory/policy*',async route=>{
  const req=route.request();
  if(req.method()==='POST'){
   const body=req.postDataJSON();commands.push(body);expect(body).toMatchObject({productId:product,variantId:variant,threshold:5,expectedRevision:0,reason:'browser reorder policy'});
   if(!saved){revision=1;saved={productId:product,variantId:variant,revision,threshold:5,beforeThreshold:null,reason:body.reason,actorId:owner,requestId:body.idempotencyKey,createdAt:'2026-10-24T19:00:00.123456Z'};}
   const uncertain=mode==='uncertain'&&commands.length===1;await route.fulfill({status:uncertain?503:200,contentType:'application/json',body:JSON.stringify(uncertain?{code:'POLICY_RESULT_UNCONFIRMED'}:saved)});return;
  }
  expect(req.method()).toBe('GET');await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:1,productId:product,variantId:variant,revision,threshold:revision?5:null,available:3,alert:revision?'low':'unset',saleEnabled:true,writesEnabled:mode!=='disabled',updatedBy:revision?owner:null,lastRequestId:saved?.requestId??null,updatedAt:saved?.createdAt??null})});
 });
 await page.goto('/admin/inventory');await expandInventoryRows(page);await page.getByRole('button',{name:'حد کمبود ذخیره‌شده',exact:true}).click();
 if(mode==='disabled'){await expect(page.getByText('تغییر حد کمبود هنوز فعال نشده است.',{exact:true})).toBeVisible();await expect(page.getByLabel('حد کمبود ذخیره‌شده جدید',{exact:true})).toHaveCount(0);expect(commands).toHaveLength(0);}
 else{
  await page.getByLabel('حد کمبود ذخیره‌شده جدید',{exact:true}).fill('۵');await page.getByLabel('دلیل تغییر حد کمبود',{exact:true}).fill('browser reorder policy');
  await page.getByRole('button',{name:'پیش‌نمایش حد کمبود',exact:true}).click();expect(commands).toHaveLength(0);
  await page.getByRole('button',{name:'تأیید و ذخیرهٔ حد کمبود',exact:true}).click();
  if(mode==='uncertain'){await expect(page.getByText('ثبت تنظیم تأیید نشد؛',{exact:false})).toBeVisible();await page.getByRole('button',{name:'بررسی دوبارهٔ همین تنظیم',exact:true}).click();expect(commands[1]).toEqual(commands[0]);}
  await expect(page.getByText('ذخیرهٔ حد کمبود تأیید شد؛',{exact:false})).toBeVisible();await expect(page.getByText('موجودی به حد کمبود ذخیره‌شده رسیده است.',{exact:true})).toBeVisible();
  await page.getByRole('button',{name:'بستن حد کمبود',exact:true}).click();await page.getByLabel('حد کمبود موجودی',{exact:true}).fill('0');
  await page.getByRole('button',{name:'حد کمبود ذخیره‌شده',exact:true}).click();await expect(page.getByText('موجودی به حد کمبود ذخیره‌شده رسیده است.',{exact:true})).toBeVisible();
  await page.reload();await expandInventoryRows(page);await page.getByRole('button',{name:'حد کمبود ذخیره‌شده',exact:true}).click();await expect(page.getByText('موجودی به حد کمبود ذخیره‌شده رسیده است.',{exact:true})).toBeVisible();expect(revision).toBe(1);expect(commands).toHaveLength(mode==='uncertain'?2:1);
 }
 expect(stockWrites).toBe(0);
});


for(const mode of ['ready','disabled'])test('global saved alert queue '+mode+' is independent of product paging and never mutates stock',async({page})=>{
 await fixtures(page,{admin:true});const product='a7000000-0000-4000-8000-000000000001',id=(n:number)=>'a7000000-0000-4000-8000-'+String(n+100).padStart(12,'0');let writes=0;const queries:URL[]=[];
 const row=(n:number)=>({productId:product,variantId:id(n),productName:'کالای سراسری '+n,sku:'SKU-global-'+n,size:'M',color:'red',quantity:n===1?null:3,threshold:5,revision:1,alert:n===1?'missing':'low',entityExists:n!==1,saleEnabled:n!==1});
 await page.route('**/api/admin/inventory/alerts?*',async route=>{
  const req=route.request(),url=new URL(req.url());queries.push(url);expect(req.method()).toBe('GET');expect(req.postData()).toBeNull();
  if(mode==='disabled'){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'POLICY_SERVER_DISABLED'})});return;}
  const zero=url.searchParams.get('filter')==='zero',next=url.searchParams.has('afterVariant');
  const rows=zero?[{...row(52),quantity:0,alert:'zero'}]:next?[row(51)]:Array.from({length:50},(_,n)=>row(n+1));const hasMore=!zero&&!next,last=rows.at(-1)!;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:1,rows,hasMore,nextCursor:hasMore?{productId:last.productId,variantId:last.variantId}:null,asOf:'2026-10-24T19:00:00.123456Z'})});
 });
 await page.route('**/api/admin/inventory/policy?*',async route=>{const req=route.request(),url=new URL(req.url());expect(req.method()).toBe('GET');expect(url.searchParams.get('productId')).toBe(product);expect(url.searchParams.get('variantId')).toBe(id(2));await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:1,productId:product,variantId:id(2),threshold:5,revision:1,available:3,alert:'low',saleEnabled:true,writesEnabled:false,updatedBy:owner,lastRequestId:'a7000000-0000-4000-8000-000000000099',updatedAt:'2026-10-24T19:00:00.123456Z'})});});
 page.on('request',req=>{if(req.url().includes('/api/admin/inventory/')&&req.method()!=='GET')writes++;});
 await page.goto('/admin/inventory');expect(queries).toHaveLength(0);await page.getByRole('button',{name:'نمایش فهرست سراسری هشدارها',exact:true}).click();const queue=page.getByRole('region',{name:'فهرست سراسری هشدار انبار',exact:true});
 if(mode==='disabled'){await expect(queue.getByText('فهرست هشدارهای ذخیره‌شده هنوز فعال نشده است.',{exact:true})).toBeVisible();await expect(queue.getByText('برای حدهای فعال ذخیره‌شده، هشداری با این فیلتر دیده نشد.',{exact:true})).toHaveCount(0);}
 else{
  await expect(queue.getByText('کالای سراسری 1؛',{exact:false})).toBeVisible();await expect(queue.getByText('برای حفظ سابقه، تنظیم حذف نشده است؛ بررسی مدیریتی لازم است.',{exact:true})).toBeVisible();
  await queue.getByRole('button',{name:'بررسی حد هشدار',exact:true}).first().click();await expect(page.getByRole('dialog').getByText('موجودی به حد کمبود ذخیره‌شده رسیده است.',{exact:true})).toBeVisible();await page.getByRole('button',{name:'بستن حد کمبود',exact:true}).click();
  await queue.getByRole('button',{name:'صفحهٔ بعدی هشدارها',exact:true}).click();await expect(queue.getByText('کالای سراسری 51؛',{exact:false})).toBeVisible();expect(queries.at(-1)!.searchParams.get('afterVariant')).toBe(id(50));
  await queue.getByLabel('نوع هشدار ذخیره‌شده',{exact:true}).selectOption('zero');await expect(queue.getByText('کالای سراسری 52؛',{exact:false})).toBeVisible();expect(queries.at(-1)!.searchParams.has('afterVariant')).toBe(false);await expect(queue.getByRole('button',{name:'صفحهٔ قبلی هشدارها',exact:true})).toBeDisabled();
 }
 expect(writes).toBe(0);
});


for(const mode of ['confirmed','uncertain','stale'])test('inventory alert followup '+mode+' preserves warning and records context-specific history',async({page})=>{
 await fixtures(page,{admin:true});const product='a8000000-0000-4000-8000-000000000001',variant='a8000000-0000-4000-8000-000000000002',epoch='a8000000-0000-4000-8000-000000000003';
 const commands:Record<string,unknown>[]=[];let saved:Record<string,unknown>|null=null,changed=false,stockWrites=0;
 const alert={productId:product,variantId:variant,productName:'کالای پیگیری مرورگر',sku:'SKU-followup',size:'M',color:'red',quantity:5,threshold:10,revision:1,alert:'low',entityExists:true,saleEnabled:true};
 await page.route('**/api/admin/inventory/alerts?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:1,rows:[alert],hasMore:false,nextCursor:null,asOf:'2026-10-24T19:00:00.123456Z'})}));
 await page.route('**/api/admin/inventory/followup**',async route=>{
  const request=route.request(),url=new URL(request.url()),reply=(body:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(body)});
  if(url.pathname.endsWith('/history')){await reply({entries:saved?[saved]:[],hasMore:false,nextCursor:null});return;}
  if(request.method()==='POST'){
   const body=request.postDataJSON();commands.push(body);expect(body).toMatchObject({productId:product,variantId:variant,inventoryRevision:epoch,policyRevision:1,expectedRevision:0,status:'reviewed',reason:'browser followup review'});
   if(mode==='stale'){changed=true;await reply({code:'FOLLOWUP_STALE_CONTEXT'},409);return;}
   if(!saved)saved={id:'a8000000-0000-4000-8000-000000000005',productId:product,variantId:variant,actorId:owner,requestId:body.idempotencyKey,inventoryRevision:epoch,policyRevision:1,revision:1,status:'reviewed',beforeStatus:'open',reason:body.reason,quantity:5,threshold:10,createdAt:'2026-10-24T19:00:00.123456Z'};
   else expect(body).toEqual(commands[0]);
   if(mode==='uncertain'&&commands.length===1){await reply({code:'FOLLOWUP_RESULT_UNCONFIRMED'},503);return;}await reply(saved);return;
  }
  await reply({version:1,productId:product,variantId:variant,inventoryRevision:changed?'a8000000-0000-4000-8000-000000000009':epoch,policyRevision:1,revision:saved?1:0,status:saved?'reviewed':'open',lastStatus:saved?'reviewed':null,quantity:5,threshold:10,alert:'low',hasEntity:true,contextChanged:false,canWrite:true,updatedBy:saved?owner:null,lastRequestId:saved?.requestId??null,updatedAt:saved?.createdAt??null});
 });
 page.on('request',request=>{if(request.url().includes('/rest/v1/product')&&request.method()!=='GET')stockWrites++;});
 await page.goto('/admin/inventory');await page.getByRole('button',{name:'نمایش فهرست سراسری هشدارها',exact:true}).click();const queue=page.getByRole('region',{name:'فهرست سراسری هشدار انبار',exact:true});
 await queue.getByRole('button',{name:'پیگیری و سابقه',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('وضعیت پیگیری',{exact:true}).selectOption('reviewed');await dialog.getByLabel('دلیل پیگیری',{exact:true}).fill('browser followup review');await dialog.getByRole('button',{name:'پیش‌نمایش پیگیری',exact:true}).click();expect(commands).toHaveLength(0);
 await dialog.getByRole('button',{name:'تأیید و ثبت پیگیری',exact:true}).click();
 if(mode==='stale'){await expect(dialog.getByText('اطلاعات تازه را بازبینی',{exact:false})).toBeVisible();await expect(dialog.getByRole('button',{name:'پیش‌نمایش پیگیری',exact:true})).toBeVisible();expect(commands).toHaveLength(1);expect(saved).toBeNull();}
 else{
  if(mode==='uncertain'){await expect(dialog.getByText('ثبت پیگیری تأیید نشد؛',{exact:false})).toBeVisible();await dialog.getByRole('button',{name:'بررسی دوبارهٔ همین پیگیری',exact:true}).click();expect(commands[1]).toEqual(commands[0]);}
  await expect(dialog.getByText('ثبت پیگیری تأیید شد؛',{exact:false})).toBeVisible();await dialog.getByRole('button',{name:'نمایش سابقهٔ پیگیری',exact:true}).click();await expect(dialog.getByRole('region',{name:'سابقهٔ پیگیری هشدار',exact:true}).getByText('دلیل: browser followup review',{exact:true})).toBeVisible();
  if(mode==='confirmed')await page.screenshot({path:'.phase3-e2e-artifacts/inventory-followup-preview.png',fullPage:true});
 }
 await dialog.getByRole('button',{name:'بستن پیگیری',exact:true}).click();await expect(queue.getByText('کالای پیگیری مرورگر؛',{exact:false})).toBeVisible();await expect(queue.getByText('کمبود موجودی؛',{exact:false})).toBeVisible();expect(stockWrites).toBe(0);
});


for(const mode of ['ready','disabled'])test('global followup filter '+mode+' applies before pagination and preserves active shortages',async({page})=>{
 await fixtures(page,{admin:true});const product='aa000000-0000-4000-8000-000000000001',id=(n:number)=>'aa000000-0000-4000-8000-'+String(n+100).padStart(12,'0');const queries:URL[]=[];let writes=0;
 const row=(n:number,status='open',changed=false)=>({productId:product,variantId:id(n),productName:'کالای فیلتر پیگیری '+n,sku:'SKU-filter-'+n,size:'M',color:'red',quantity:3,threshold:5,revision:1,alert:'low',entityExists:true,saleEnabled:true,followupStatus:status,followupRevision:status==='open'&&!changed?0:2,contextChanged:changed});
 await page.route('**/api/admin/inventory/alerts?*',async route=>{
  const request=route.request(),url=new URL(request.url());queries.push(url);expect(request.method()).toBe('GET');
  const filter=url.searchParams.get('followup')??'all',next=url.searchParams.has('afterVariant');
  if(mode==='disabled'&&filter!=='all'){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'FOLLOWUP_SERVER_DISABLED'})});return;}
  const rows=filter==='reviewed'?(next?[row(51,'reviewed')]:Array.from({length:50},(_,n)=>row(n+1,'reviewed'))):filter==='needs_review'?[row(52,'open',true)]:[row(1)];const hasMore=filter==='reviewed'&&!next,last=rows.at(-1)!;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:1,rows,hasMore,nextCursor:hasMore?{productId:last.productId,variantId:last.variantId}:null,asOf:'2026-10-25T00:00:00.123456Z'})});
 });
 page.on('request',req=>{if(req.url().includes('/api/admin/inventory/')&&req.method()!=='GET')writes++;});
 await page.goto('/admin/inventory');await page.getByRole('button',{name:'نمایش فهرست سراسری هشدارها',exact:true}).click();const queue=page.getByRole('region',{name:'فهرست سراسری هشدار انبار',exact:true});await expect(queue.getByText('کالای فیلتر پیگیری 1؛',{exact:false})).toBeVisible();
 await queue.getByLabel('فیلتر وضعیت پیگیری هشدار',{exact:true}).selectOption('reviewed');
 if(mode==='disabled'){await expect(queue.getByText('فیلتر وضعیت پیگیری هنوز فعال نشده است.',{exact:true})).toBeVisible();await expect(queue.getByText('برای حدهای فعال ذخیره‌شده، هشداری با این فیلتر دیده نشد.',{exact:true})).toHaveCount(0);}
 else{
  await expect(queue.getByText('کالای فیلتر پیگیری 50؛',{exact:false})).toBeVisible();await expect(queue.getByText('پیگیری: بازبینی‌شده؛ نسخهٔ پیگیری: 2',{exact:true})).toHaveCount(50);
  await queue.getByRole('button',{name:'صفحهٔ بعدی هشدارها',exact:true}).click();await expect(queue.getByText('کالای فیلتر پیگیری 51؛',{exact:false})).toBeVisible();expect(queries.at(-1)!.searchParams.get('followup')).toBe('reviewed');expect(queries.at(-1)!.searchParams.get('afterVariant')).toBe(id(50));
  await queue.getByLabel('فیلتر وضعیت پیگیری هشدار',{exact:true}).selectOption('needs_review');await expect(queue.getByText('کالای فیلتر پیگیری 52؛',{exact:false})).toBeVisible();await expect(queue.getByText('بازبینی دوباره لازم است.',{exact:false})).toBeVisible();expect(queries.at(-1)!.searchParams.has('afterVariant')).toBe(false);await expect(queue.getByText('کمبود موجودی؛',{exact:false})).toBeVisible();await expect(queue.getByRole('button',{name:'صفحهٔ قبلی هشدارها',exact:true})).toBeDisabled();
  await page.screenshot({path:'.phase3-e2e-artifacts/inventory-followup-filter-preview.png',fullPage:true});
 }
 expect(writes).toBe(0);
});


for(const mode of ['confirmed','uncertain','revoked','disabled'])test('inventory assignment '+mode+' requires a current manager and immutable confirmation',async({page})=>{
 await fixtures(page,{admin:true});const product='ac000000-0000-4000-8000-000000000001',variant='ac000000-0000-4000-8000-000000000002',epoch='ac000000-0000-4000-8000-000000000003',assignee='ac000000-0000-4000-8000-000000000009';const commands:Record<string,unknown>[]=[];let saved:Record<string,unknown>|null=null,stockWrites=0;
 await page.route('**/api/admin/inventory/alerts?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:1,rows:[{productId:product,variantId:variant,productName:'کالای تخصیص مرورگر',sku:'SKU-owner',size:'M',color:'red',quantity:5,threshold:10,revision:1,alert:'low',entityExists:true,saleEnabled:true}],hasMore:false,nextCursor:null,asOf:'2026-10-25T01:00:00.123456Z'})}));
 await page.route('**/api/admin/inventory/assignees*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({rows:[{id:assignee,name:'مدیر پیگیری آزمایشی'}],hasMore:false,nextCursor:null})}));
 await page.route('**/api/admin/inventory/assignment**',async route=>{
  const request=route.request(),url=new URL(request.url()),reply=(value:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(value)});
  if(mode==='disabled'){await reply({code:'ASSIGNMENT_SERVER_DISABLED'},503);return;}
  if(url.pathname.endsWith('/history')){await reply({entries:saved?[saved]:[],hasMore:false,nextCursor:null});return;}
  if(request.method()==='POST'){
   const body=request.postDataJSON();commands.push(body);expect(body).toMatchObject({productId:product,variantId:variant,inventoryRevision:epoch,policyRevision:1,expectedRevision:0,assigneeId:assignee,reason:'browser owner assignment'});
   if(mode==='revoked'){await reply({code:'ASSIGNMENT_TARGET_INACTIVE'},409);return;}
   if(!saved)saved={id:'ac000000-0000-4000-8000-000000000005',productId:product,variantId:variant,inventoryRevision:epoch,policyRevision:1,revision:1,assigneeId:assignee,beforeAssigneeId:null,reason:body.reason,actorId:owner,requestId:body.idempotencyKey,createdAt:'2026-10-25T01:00:00.123456Z'};else expect(body).toEqual(commands[0]);
   if(mode==='uncertain'&&commands.length===1){await reply({code:'ASSIGNMENT_RESULT_UNCONFIRMED'},503);return;}await reply(saved);return;
  }
  await reply({context:{version:1,productId:product,variantId:variant,inventoryRevision:epoch,policyRevision:1,revision:0,status:'open',lastStatus:null,quantity:5,threshold:10,alert:'low',hasEntity:true,contextChanged:false,canWrite:false,updatedBy:null,lastRequestId:null,updatedAt:null},revision:saved?1:0,assigneeId:saved?assignee:null,assigneeName:saved?'مدیر پیگیری آزمایشی':null,assigneeActive:!!saved,canWrite:true,updatedBy:saved?owner:null,lastRequestId:saved?.requestId??null,updatedAt:saved?.createdAt??null});
 });
 page.on('request',request=>{if(request.url().includes('/rest/v1/product')&&request.method()!=='GET')stockWrites++;});
 await page.goto('/admin/inventory');await page.getByRole('button',{name:'نمایش فهرست سراسری هشدارها',exact:true}).click();const queue=page.getByRole('region',{name:'فهرست سراسری هشدار انبار',exact:true});await queue.getByRole('button',{name:'مسئول پیگیری',exact:true}).click();const dialog=page.getByRole('dialog');
 if(mode==='disabled'){await expect(dialog.getByText('مسئول پیگیری دریافت نشد؛ بدون مسئول فرض نمی‌شود.',{exact:true})).toBeVisible();await expect(dialog.getByLabel('مسئول جدید هشدار',{exact:true})).toHaveCount(0);expect(commands).toHaveLength(0);return;}
 await dialog.getByLabel('مسئول جدید هشدار',{exact:true}).selectOption(assignee);await dialog.getByLabel('دلیل تغییر مسئول',{exact:true}).fill('browser owner assignment');await dialog.getByRole('button',{name:'پیش‌نمایش تغییر مسئول',exact:true}).click();expect(commands).toHaveLength(0);await dialog.getByRole('button',{name:'تأیید و ثبت مسئول',exact:true}).click();
 if(mode==='revoked'){await expect(dialog.getByText('دوباره بررسی و پیش‌نمایش تازه بسازید.',{exact:false})).toBeVisible();await expect(dialog.getByRole('button',{name:'پیش‌نمایش تغییر مسئول',exact:true})).toBeVisible();expect(saved).toBeNull();}
 else{
  if(mode==='uncertain'){await expect(dialog.getByText('تغییر مسئول تأیید نشد؛',{exact:false})).toBeVisible();await dialog.getByRole('button',{name:'بررسی دوبارهٔ همین تغییر مسئول',exact:true}).click();expect(commands[1]).toEqual(commands[0]);}
  await expect(dialog.getByText('تغییر مسئول تأیید شد؛',{exact:false})).toBeVisible();await dialog.getByRole('button',{name:'نمایش سابقهٔ مسئول',exact:true}).click();await expect(dialog.getByRole('region',{name:'سابقهٔ تغییر مسئول',exact:true}).getByText('دلیل: browser owner assignment',{exact:true})).toBeVisible();
  if(mode==='confirmed')await page.screenshot({path:'.phase3-e2e-artifacts/inventory-assignment-preview.png',fullPage:true});
 }
 await dialog.getByRole('button',{name:'بستن مسئول پیگیری',exact:true}).click();await expect(queue.getByText('کمبود موجودی؛',{exact:false})).toBeVisible();expect(stockWrites).toBe(0);
});


for(const mode of ['ready','disabled'])test('assignment queue '+mode+' isolates mine and distinguishes unassigned from inactive owners',async({page})=>{
 await fixtures(page,{admin:true});const product='ae000000-0000-4000-8000-000000000001',other='ae000000-0000-4000-8000-000000000009',id=(n:number)=>'ae000000-0000-4000-8000-'+String(n+100).padStart(12,'0');const queries:URL[]=[];let writes=0;
 const row=(n:number,assignee:string|null=owner,active=true)=>({productId:product,variantId:id(n),productName:'کالای مسئول صف '+n,sku:'SKU-mine-'+n,size:'M',color:'red',quantity:3,threshold:5,revision:1,alert:'low',entityExists:true,saleEnabled:true,followupStatus:'open',followupRevision:0,contextChanged:false,assigneeId:assignee,assignmentRevision:assignee?1:0,assigneeActive:active});
 await page.route('**/api/admin/inventory/alerts?*',async route=>{
  const request=route.request(),url=new URL(request.url());queries.push(url);expect(request.method()).toBe('GET');expect(url.searchParams.has('actor')).toBe(false);expect(url.searchParams.has('assigneeId')).toBe(false);
  const assignment=url.searchParams.get('assignment')??'all',next=url.searchParams.has('afterVariant');
  if(mode==='disabled'&&assignment!=='all'){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'ASSIGNMENT_SERVER_DISABLED'})});return;}
  const rows=assignment==='mine'?(next?[row(51)]:Array.from({length:50},(_,n)=>row(n+1))):assignment==='unassigned'?[row(52,null,false)]:assignment==='inactive'?[row(53,other,false)]:[row(1,other)];const hasMore=assignment==='mine'&&!next,last=rows.at(-1)!;
  await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({version:1,rows,hasMore,nextCursor:hasMore?{productId:last.productId,variantId:last.variantId}:null,asOf:'2026-10-25T12:00:00.123456Z'})});
 });
 page.on('request',request=>{if(request.url().includes('/api/admin/inventory/')&&request.method()!=='GET')writes++;});
 await page.goto('/admin/inventory');await page.getByRole('button',{name:'نمایش فهرست سراسری هشدارها',exact:true}).click();const queue=page.getByRole('region',{name:'فهرست سراسری هشدار انبار',exact:true});await expect(queue.getByText('کالای مسئول صف 1؛',{exact:false})).toBeVisible();await queue.getByLabel('فیلتر مسئول پیگیری',{exact:true}).selectOption('mine');
 if(mode==='disabled'){await expect(queue.getByText('فیلتر مسئول پیگیری هنوز فعال نشده است.',{exact:true})).toBeVisible();await expect(queue.getByText('برای حدهای فعال ذخیره‌شده، هشداری با این فیلتر دیده نشد.',{exact:true})).toHaveCount(0);}
 else{
  await expect(queue.getByText('مسئول: من',{exact:true})).toHaveCount(50);await queue.getByRole('button',{name:'صفحهٔ بعدی هشدارها',exact:true}).click();await expect(queue.getByText('کالای مسئول صف 51؛',{exact:false})).toBeVisible();expect(queries.at(-1)!.searchParams.get('assignment')).toBe('mine');expect(queries.at(-1)!.searchParams.get('afterVariant')).toBe(id(50));
  await queue.getByLabel('فیلتر مسئول پیگیری',{exact:true}).selectOption('unassigned');await expect(queue.getByText('مسئول: بدون مسئول',{exact:true})).toBeVisible();expect(queries.at(-1)!.searchParams.has('afterVariant')).toBe(false);await expect(queue.getByRole('button',{name:'صفحهٔ قبلی هشدارها',exact:true})).toBeDisabled();
  await queue.getByLabel('فیلتر مسئول پیگیری',{exact:true}).selectOption('inactive');await expect(queue.getByText('دسترسی مدیریتی مسئول غیرفعال است.',{exact:false})).toBeVisible();await expect(queue.getByText('مسئول: بدون مسئول',{exact:true})).toHaveCount(0);await expect(queue.getByText('کمبود موجودی؛',{exact:false})).toBeVisible();await page.screenshot({path:'.phase3-e2e-artifacts/inventory-assignment-queue-preview.png',fullPage:true});
 }
 expect(writes).toBe(0);
});


for(const mode of ['confirmed','uncertain','disabled'])test('ERP workflow '+mode+' never establishes payment and requires a reasoned confirmation',async({page})=>{
 await fixtures(page,{admin:true});let state='confirmed';const commands:Record<string,unknown>[]=[];
 await page.route('**/api/admin/erp/**',async route=>{
  const request=route.request(),url=new URL(request.url()),reply=(v:unknown,status=200)=>route.fulfill({status,contentType:'application/json',body:JSON.stringify(v)});
  if(mode==='disabled'){await reply({code:'ERP_SERVER_DISABLED'},503);return;}
  if(url.pathname.endsWith('/list')){await reply({rows:[{id:orderId,status:state,paymentState:'paid',amount:'10000',createdAt:'2026-10-25T12:00:00Z',refundState:'none',refundRevision:0,refundAmount:null}],hasMore:false,nextCursor:null});return;}
  expect(request.method()).toBe('POST');const body=request.postDataJSON();commands.push(body);expect(body).toMatchObject({resource:'order',entityId:orderId,expected:'confirmed',next:'processing',reason:'packing browser fixture',detail:null,amount:null});state='processing';if(mode==='uncertain'&&commands.length===1){await reply({code:'ERP_RESULT_UNCONFIRMED'},503);return;}if(commands.length>1)expect(body).toEqual(commands[0]);await reply({...body,id:addressId,actorId:owner,requestId:body.idempotencyKey,createdAt:'2026-10-25T12:00:00.123456Z'});
 });
 await page.goto('/admin/erp');await expect(page.getByRole('heading',{name:'عملیات و گزارش‌های مدیریت',exact:true})).toBeVisible();
 if(mode==='disabled'){await expect(page.getByText('ممکن است این بخش هنوز فعال نشده باشد.',{exact:false})).toBeVisible();expect(commands).toHaveLength(0);return;}
 await page.getByRole('button',{name:'انتقال به بسته‌بندی',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('دلیل عملیات',{exact:true}).fill('packing browser fixture');await dialog.getByRole('button',{name:'پیش‌نمایش عملیات',exact:true}).click();expect(commands).toHaveLength(0);await dialog.getByRole('button',{name:'تأیید و ثبت عملیات',exact:true}).click();
 if(mode==='uncertain'){await expect(dialog.getByText('نتیجه تأیید نشد؛',{exact:false})).toBeVisible();await dialog.getByRole('button',{name:'بررسی دوبارهٔ همین عملیات',exact:true}).click();}
 await expect(dialog.getByText('ثبت عملیات تأیید شد.',{exact:true})).toBeVisible();await dialog.getByRole('button',{name:'بستن عملیات',exact:true}).click();await expect(page.getByRole('button',{name:'انتقال به ارسال‌شده',exact:true})).toBeVisible();expect(commands).toHaveLength(mode==='uncertain'?2:1);
});
test('ERP paid-sales report preserves money strings and does not invent profit or bank-confirmed refunds',async({page})=>{
 await fixtures(page,{admin:true});await page.route('**/api/admin/erp/list?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({rows:[],hasMore:false,nextCursor:null})}));await page.route('**/api/admin/erp/sales?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({currency:'IRR',paidOrders:'1',paidTotal:'10000',shippingTotal:'1000',unpaidOrLegacy:'2',recordedExternalRefunds:'3000',grossProfit:null,profitUnavailableReason:'purchase-cost-snapshots-unavailable',topProducts:[]})}));
 await page.goto('/admin/erp');await page.getByLabel('بخش عملیات مدیریت',{exact:true}).selectOption('sales');await page.getByRole('button',{name:'محاسبهٔ گزارش',exact:true}).click();await expect(page.getByText('مبلغ پرداخت‌شده: 10000 ریال',{exact:true})).toBeVisible();await expect(page.getByText('سود ناخالص: در دسترس نیست؛ بهای خرید تاریخی ثبت نشده است.',{exact:true})).toBeVisible();await expect(page.getByText('بدون ادعای تأیید بانک: 3000 ریال',{exact:false})).toBeVisible();await page.screenshot({path:'.phase3-e2e-artifacts/erp-sales-preview.png',fullPage:true});
 const pendingCsv=page.waitForEvent('download');await page.getByRole('button',{name:'خروجی CSV خلاصهٔ گزارش',exact:true}).click();const download=await pendingCsv;expect(download.suggestedFilename()).toBe('paid-sales-summary.csv');const stream=await download.createReadStream();const chunks=[];for await(const chunk of stream!)chunks.push(chunk);const csv=Buffer.concat(chunks).toString('utf8');expect(csv).toContain('UNKNOWN_PURCHASE_COSTS');expect(csv).toContain('manualRefundEvidenceNotBankConfirmed');expect(csv).toContain('10000');
 await fixtures(page,{admin:false});await page.goto('/admin/erp');await expect(page).toHaveURL('http://127.0.0.1:4179/');
});


test('ERP unit purchase costs require confirmation and report explicit gross item margin',async({page})=>{
 await fixtures(page,{admin:true});let cost:string|null=null;let writes=0;
 await page.route('**/api/admin/erp/**',async route=>{
  const req=route.request(),url=new URL(req.url()),reply=(v:unknown)=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify(v)});
  if(url.pathname.endsWith('/sales')){await reply({currency:'IRR',paidOrders:'1',paidTotal:'10000',shippingTotal:'0',unpaidOrLegacy:'0',recordedExternalRefunds:'0',grossProfit:cost?'8000':null,profitUnavailableReason:cost?null:'purchase-cost-snapshots-unavailable',topProducts:[]});return;}
  if(url.pathname.endsWith('/list')){await reply({rows:url.searchParams.get('resource')==='costs'?[{id:productId,orderId,quantity:1,salePrice:'10000',unitCost:cost,revision:cost?1:0}]:[],hasMore:false,nextCursor:null});return;}
  const body=req.postDataJSON();expect(body).toMatchObject({resource:'cost',entityId:productId,expected:'0',next:'recorded',amount:2000,reason:'record purchase evidence'});writes++;cost='2000';await reply({...body,id:addressId,actorId:owner,requestId:body.idempotencyKey,createdAt:'2026-10-25T12:00:00.123456Z'});
 });
 await page.goto('/admin/erp');await page.getByLabel('بخش عملیات مدیریت',{exact:true}).selectOption('costs');await page.getByRole('button',{name:'انتقال به ثبت بهای خرید',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('دلیل عملیات',{exact:true}).fill('record purchase evidence');await dialog.getByLabel('بهای خرید واحد',{exact:true}).fill('2000');await dialog.getByRole('button',{name:'پیش‌نمایش عملیات',exact:true}).click();expect(writes).toBe(0);await dialog.getByRole('button',{name:'تأیید و ثبت عملیات',exact:true}).click();await expect(dialog.getByText('ثبت عملیات تأیید شد.',{exact:true})).toBeVisible();await dialog.getByRole('button',{name:'بستن عملیات',exact:true}).click();await page.getByLabel('بخش عملیات مدیریت',{exact:true}).selectOption('sales');await page.getByRole('button',{name:'محاسبهٔ گزارش',exact:true}).click();await expect(page.getByText('حاشیهٔ ناخالص اقلام: 8000 ریال؛',{exact:false})).toBeVisible();expect(writes).toBe(1);
});

for(const mode of ['confirmed','disabled'])test('legacy order list uses reasoned ERP workflow '+mode+' without direct table writes',async({page})=>{
 await fixtures(page,{admin:true});let status='confirmed',writes=0;
 await page.route('**/rest/v1/orders?*',async route=>{expect(route.request().method()).toBe('GET');await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:orderId,created_at:user.createdAt,status,total_amount:10000,shipping_cost:0,shipping_method:'regular',payment_method:'gateway',user_id:owner,profiles:null,checkout_version:2,payment_state:'paid'}])});});
 await page.route('**/api/admin/erp/operation',async route=>{writes++;const body=route.request().postDataJSON();expect(body).toMatchObject({resource:'order',entityId:orderId,expected:'confirmed',next:'processing',reason:'packing legacy page'});if(mode==='disabled'){await route.fulfill({status:503,contentType:'application/json',body:JSON.stringify({code:'ERP_SERVER_DISABLED'})});return;}status='processing';await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({...body,id:addressId,actorId:owner,requestId:body.idempotencyKey,createdAt:'2026-10-25T12:00:00.123456Z'})});});
 await page.goto('/admin/orders');await page.getByRole('button',{name:'انتقال به بسته‌بندی',exact:true}).click();const dialog=page.getByRole('dialog');await dialog.getByLabel('دلیل عملیات').fill('packing legacy page');await dialog.getByRole('button',{name:'پیش‌نمایش عملیات',exact:true}).click();expect(writes).toBe(0);await dialog.getByRole('button',{name:'تأیید و ثبت عملیات',exact:true}).click();if(mode==='confirmed'){await expect(dialog.getByText('ثبت عملیات تأیید شد.',{exact:true})).toBeVisible();await dialog.getByRole('button',{name:'بستن عملیات',exact:true}).click();await expect(page.getByRole('button',{name:'انتقال به ارسال‌شده',exact:true})).toBeVisible();}else{await expect(dialog.getByText('نتیجه تأیید نشد؛',{exact:false})).toBeVisible();expect(status).toBe('confirmed');}expect(writes).toBe(1);
});
test('legacy returns page opens the reviewed returns section instead of directly changing status',async({page})=>{
 await fixtures(page,{admin:true});await page.route('**/rest/v1/return_requests?*',async route=>{expect(route.request().method()).toBe('GET');await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:addressId,user_id:owner,order_id:orderId,orders:{id:orderId},phone:'synthetic',description:'synthetic return',image_urls:[],status:'pending',created_at:user.createdAt}])});});
 await page.route('**/rest/v1/profiles?*',async route=>{if(!new URL(route.request().url()).searchParams.get('id')?.startsWith('in.')){await route.fallback();return;}await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:owner,first_name:'Synthetic',last_name:'Fixture',phone:null}])});});
 await page.route('**/api/admin/erp/list?*',async route=>{expect(new URL(route.request().url()).searchParams.get('resource')).toBe('returns');await route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({rows:[{id:addressId,orderId,status:'pending',revision:0,createdAt:user.createdAt}],hasMore:false,nextCursor:null})});});
 await page.goto('/admin/return-requests');await page.getByRole('link',{name:'گردش مرجوعی و سابقه',exact:true}).click();await expect(page).toHaveURL(/section=returns/);await expect(page.getByLabel('بخش عملیات مدیریت',{exact:true})).toHaveValue('returns');await expect(page.getByRole('button',{name:'انتقال به پذیرفته‌شده',exact:true})).toBeVisible();
});

test('admin design keeps bulk actions contextual and mobile navigation usable',async({page})=>{
 await fixtures(page,{admin:true});
 await page.route('**/rest/v1/products*',async route=>{const select=new URL(route.request().url()).searchParams.get('select')??'';if(!select.includes('stock_quantity')){await route.fallback();return;}await route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-1/2','access-control-expose-headers':'content-range'},body:JSON.stringify([{id:productId,name:'جوراب ساق‌دار مردانه',is_active:true,is_out_of_stock:false,product_variants:[{id:addressId,product_id:productId,sku:'SOCK-BLK-M',size:'M',color:'مشکی',stock_quantity:12}]},{id:orderId,name:'جوراب کالج زنانه',is_active:true,is_out_of_stock:false,product_variants:[]}])});});
 await page.route('**/rest/v1/orders*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify([{id:orderId,created_at:'2026-10-26T12:00:00Z',status:'pending_payment',total_amount:5900000,shipping_cost:0,shipping_method:'regular',payment_method:'gateway',user_id:owner,profiles:{first_name:'کاربر',last_name:'آزمایشی',phone:'+989110000001'},checkout_version:2,payment_state:'pending'}])}));

 await page.goto('/admin/products');await expect(page.getByLabel('انتخاب '+item.productTitle,{exact:true})).toBeVisible();
 await expect(page.getByRole('button',{name:'پیش‌نمایش تغییر وضعیت',exact:true})).toHaveCount(0);
 await page.getByLabel('انتخاب '+item.productTitle,{exact:true}).check();await expect(page.getByRole('button',{name:'پیش‌نمایش تغییر وضعیت',exact:true})).toBeVisible();
 await page.getByLabel('انتخاب '+item.productTitle,{exact:true}).uncheck();await expect(page.getByRole('button',{name:'پیش‌نمایش تغییر وضعیت',exact:true})).toHaveCount(0);
 await page.setViewportSize({width:1440,height:1000});
 for(const section of ['products','inventory','orders','erp']){
  await page.goto('/admin/'+section);await expect(page.locator('h1')).toBeVisible();
  if(section==='erp')await expect(page.getByRole('alert')).toBeVisible();if(section==='inventory')await expect(page.getByText('نیازمند تعریف تنوع',{exact:true})).toBeVisible();
  await page.screenshot({path:'.phase3-e2e-artifacts/admin-'+section+'-design.png',fullPage:false});
 }
 await page.setViewportSize({width:375,height:812});
 for(const section of ['products','inventory','orders','erp']){
  await page.goto('/admin/'+section);await expect(page.locator('h1')).toBeVisible();
  if(section==='inventory')await expect(page.getByText('نیازمند تعریف تنوع',{exact:true})).toBeVisible();
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth+1)).toBe(true);
  await page.screenshot({path:'.phase3-e2e-artifacts/admin-'+section+'-mobile.png',fullPage:false});
 }
 await page.getByRole('button',{name:'منوی مدیریت',exact:true}).click();await expect(page.getByRole('dialog')).toBeVisible();await page.getByRole('dialog').getByRole('link',{name:'محصولات',exact:true}).click();await expect(page).toHaveURL(/\/admin\/products$/);
});

test('admin inventory distinguishes missing variants from zero stock and ERP shows structured records',async({page})=>{
 await fixtures(page,{admin:true});
 await page.route('**/rest/v1/products*',route=>route.fulfill({status:200,contentType:'application/json',headers:{'content-range':'0-0/1','access-control-expose-headers':'content-range'},body:JSON.stringify([{id:productId,name:'محصول بدون تنوع',is_active:true,is_out_of_stock:false,product_variants:[]}])}));
 await page.goto('/admin/inventory');await expect(page.getByText('نیازمند تعریف تنوع',{exact:true})).toBeVisible();await expect(page.getByRole('button',{name:'جزئیات تنوع‌ها',exact:true})).toHaveCount(0);
 await page.route('**/api/admin/erp/list?*',route=>route.fulfill({status:200,contentType:'application/json',body:JSON.stringify({rows:[{id:orderId,status:'processing',paymentState:'paid',amount:'5900000',createdAt:'2026-10-26T12:00:00.000000Z'}],hasMore:false,nextCursor:null})}));
 await page.setViewportSize({width:1440,height:1000});await page.goto('/admin/erp');await expect(page.getByRole('table')).toBeVisible();await expect(page.getByText('۵٬۹۰۰٬۰۰۰ ریال',{exact:true})).toBeVisible();
 await page.screenshot({path:'.phase3-e2e-artifacts/admin-erp-records-design.png',fullPage:false});
});
