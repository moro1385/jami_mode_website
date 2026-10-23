export function CatalogReadError({ retry, busy = false }: { retry: () => unknown; busy?: boolean }) {
  return <div role="alert" className="py-8 text-center text-sm">
    <p>دریافت محصولات ممکن نیست. دوباره بررسی کنید.</p>
    <button type="button" disabled={busy} onClick={() => { void retry(); }} className="mt-4 underline">بررسی دوباره محصولات</button>
  </div>;
}
