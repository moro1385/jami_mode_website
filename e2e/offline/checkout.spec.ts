import { test, expect, type Page } from '@playwright/test';

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
  if (req.method() === 'PATCH') { writes++; status = req.postDataJSON().status; await route.fulfill({ status: 200, contentType: 'application/json', body: 'null' }); return; }
  reads++; await route.fulfill({ status: reads === 1 ? 403 : 200, contentType: 'application/json', body: JSON.stringify(reads === 1 ? { code: '42501', message: 'Synthetic refusal' } : [{ id: 'ticket-fixture', first_name: 'کاربر', last_name: 'آزمایشی', email: null, subject: 'تیکت ساختگی', message: 'متن ساختگی', status, created_at: user.createdAt }]) });
 });
 await page.goto('/admin/tickets'); await expect(page.getByRole('alert')).toBeVisible();
 await expect(page.getByText('هیچ تیکتی یافت نشد', { exact: true })).toHaveCount(0);
 await page.getByRole('button', { name: 'تلاش دوباره', exact: true }).click();
 await page.getByRole('button', { name: 'تغییر به پاسخ داده شده', exact: true }).click();
 await expect(page.getByRole('button', { name: 'تغییر به در انتظار بررسی', exact: true })).toBeVisible(); expect(writes).toBe(1);
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
