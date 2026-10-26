import {supabaseAssetUrl} from '@/lib/supabaseRelay';
import {AdminPageHeader,AdminStat,AdminBadge} from '@/components/admin/AdminPrimitives';
import { categoryFilterLabel } from '@/features/catalog/domain/productCategories';
import { filterAdminProducts, MAX_PRODUCT_BATCH, type ProductStatusFilter } from '@/features/catalog/domain/productManagement';
import { ProductManagementToolbar } from '@/features/catalog/presentation/ProductManagementToolbar';
import { useAuthStore } from '@/stores/authStore';
import { useAdminProducts } from '@/features/catalog/presentation/useAdminProducts';
import { ReadFailure } from '@/shared/presentation/ReadFailure';
import { useRequestScope } from '@/shared/presentation/useRequestScope';
import { errorMessage } from "@/lib/errors";
import { useEffect, useState } from "react";
import type { AdminProduct as Product } from "@/features/catalog/admin";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Loader2, Copy, Package, CheckCircle2, Files, MousePointer2 } from "lucide-react";
import { toast } from "sonner";
import { ProductFormDialog } from "@/components/admin/ProductFormDialog";
import { Input } from "@/components/ui/input";


function EditablePriceCell({ product, busy, save }: { product: Product; busy: boolean; save: (id: string, price: number) => Promise<boolean> }) {
  const capture = useRequestScope(product.id);
  const [isEditing, setIsEditing] = useState(false);
  const [currentPrice, setCurrentPrice] = useState(product.price);
  const [editValue, setEditValue] = useState(currentPrice?.toString() || "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCurrentPrice(product.price);
    setEditValue(product.price?.toString() || "");
  }, [product.price]);

  const handleSave = async () => {
    if (isSaving || busy) return;

    if (!editValue || editValue.trim() === "") {
      setEditValue(currentPrice?.toString() || "");
      setIsEditing(false);
      return;
    }

    const numericPrice = parseFloat(editValue);
    if (isNaN(numericPrice)) {
      toast.error("لطفاً یک قیمت معتبر وارد کنید");
      setEditValue(currentPrice?.toString() || "");
      setIsEditing(false);
      return;
    }

    if (numericPrice === currentPrice) {
      setIsEditing(false);
      return;
    }

    const current = capture();
    setIsSaving(true);
    try {
      await save(product.id, numericPrice);
      if (!current()) return;
    } catch (err: unknown) {
      if (!current()) return;
      console.error("Error updating price:", err);
      toast.error(errorMessage(err, "بروزرسانی قیمت با شکست مواجه شد"));
      setEditValue(currentPrice?.toString() || "");
    } finally {
      if (current()) { setIsSaving(false); setIsEditing(false); }
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      handleSave();
    } else if (e.key === "Escape") {
      e.preventDefault();
      setEditValue(currentPrice?.toString() || "");
      setIsEditing(false);
    }
  };

  if (isEditing) {
    return (
      <TableCell className="min-w-[120px]">
        <Input
          type="number"
          value={editValue}
          onChange={(e) => setEditValue(e.target.value)}
          onBlur={handleSave}
          onKeyDown={handleKeyDown}
          disabled={isSaving || busy}
          autoFocus
          className="h-8"
          dir="ltr"
        />
      </TableCell>
    );
  }

  return (
    <TableCell
      className="cursor-pointer group hover:bg-muted/50 transition-colors"
      onClick={() => { if (!busy) setIsEditing(true); }}
      title="برای ویرایش کلیک کنید"
    >
      <div className="flex items-center gap-2">
        <span>{new Intl.NumberFormat('fa-IR').format(currentPrice ?? 0)} ریال</span>
        <Edit className="w-3 h-3 text-muted-foreground opacity-0 group-hover:opacity-100 transition-opacity" />
      </div>
    </TableCell>
  );
}

export default function AdminProducts() {
 const ownerId = useAuthStore(state => state.user?.id);
 return <AdminProductsContent key={ownerId ?? 'signed-out'} ownerId={ownerId} />;
}
function AdminProductsContent({ ownerId }: { ownerId?: string }) {
  const { products, loading: isLoading, error, retry: fetchProducts, pending, duplicate: handleDuplicateProduct, changePrice, bulkStatus, bulkPrices, bulkCategories, bulkImages, bulkImageUploads, batchKind, batchReport, busy } = useAdminProducts(ownerId);

  const [search, setSearch] = useState(''), [status, setStatus] = useState<ProductStatusFilter>('all');
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const visible = filterAdminProducts(products, search, status);
  const selected = visible.filter(product => selectedIds.includes(product.id));
  const toggle = (id: string) => setSelectedIds(ids => ids.includes(id) ? ids.filter(value => value !== id) : ids.length < MAX_PRODUCT_BATCH ? [...ids, id] : ids);
  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  const handleAddProduct = () => {
    setEditingProduct(null);
    setIsDialogOpen(true);
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setIsDialogOpen(true);
  };


  return (
    <div className="space-y-6">
      <AdminPageHeader eyebrow="کاتالوگ فروشگاه" title="محصولات" description="محصولات را پیدا کنید، ویرایش کنید و برای فروش آماده نگه دارید." action={<Button disabled={busy} onClick={handleAddProduct}><Plus className="w-4 h-4 ml-2"/>افزودن محصول</Button>}/>
      <div className="admin-stats"><AdminStat label="محصولات بارگیری‌شده" value={isLoading||error?undefined:products.length} icon={<Package/>}/><AdminStat label="محصول فعال" value={isLoading||error?undefined:products.filter(p=>p.is_active).length} icon={<CheckCircle2/>}/><AdminStat label="پیش‌نویس" value={isLoading||error?undefined:products.filter(p=>!p.is_active).length} icon={<Files/>}/><AdminStat label="انتخاب‌شده" value={selected.length} icon={<MousePointer2/>}/></div>
      <ProductFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        product={editingProduct}
        onSuccess={fetchProducts}
      />

      <ProductManagementToolbar submitImageUploads={bulkImageUploads} submitImages={async targets => { const result = await bulkImages(targets); if (result) setSelectedIds(ids => ids.filter(id => !result.succeeded.includes(id) && !result.unchanged.includes(id))); return result; }} ownerId={ownerId} submitCategories={async (targets, edit) => { const result = await bulkCategories(targets, edit); if (result) setSelectedIds(ids => ids.filter(id => !result.succeeded.includes(id) && !result.unchanged.includes(id))); return result; }} search={search} status={status} changeSearch={value => { setSearch(value); setSelectedIds([]); }} changeStatus={value => { setStatus(value); setSelectedIds([]); }} selected={selected} busy={busy || isLoading || !!error || isDialogOpen} report={batchReport} reportKind={batchKind} submitPrices={async targets => { const result = await bulkPrices(targets); if (result) setSelectedIds(ids => ids.filter(id => !result.succeeded.includes(id) && !result.unchanged.includes(id))); return result; }} submit={async (targets, active) => { const result = await bulkStatus(targets, active); if (result) setSelectedIds(ids => ids.filter(id => !result.succeeded.includes(id) && !result.unchanged.includes(id))); return result; }} />
      <div className="admin-table-note"><span>{visible.length.toLocaleString('fa-IR')} محصول از {products.length.toLocaleString('fa-IR')} محصول بارگیری‌شده</span><span>قیمت‌ها به ریال</span></div>
      <div className="admin-card">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <ReadFailure retry={fetchProducts} message="بارگیری محصولات با شکست مواجه شد." />
        ) : visible.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            {products.length ? 'محصولی مطابق جست‌وجو و فیلتر پیدا نشد.' : 'هیچ محصولی پیدا نشد. برای شروع یکی اضافه کنید.'}
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead><input type="checkbox" aria-label="انتخاب محصولات نمایش‌داده‌شده" disabled={busy || !visible.length} checked={!!visible.length && visible.slice(0, MAX_PRODUCT_BATCH).every(product => selectedIds.includes(product.id))} onChange={event => setSelectedIds(event.target.checked ? visible.slice(0, MAX_PRODUCT_BATCH).map(product => product.id) : [])} /></TableHead>
                <TableHead>نام</TableHead>
                <TableHead>بخش / نوع</TableHead>
                <TableHead>قیمت</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead className="text-left">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {visible.map((product) => (
                <TableRow key={product.id}>
                  <TableCell><input type="checkbox" aria-label={`انتخاب ${product.name}`} checked={selectedIds.includes(product.id)} disabled={busy || (!selectedIds.includes(product.id) && selectedIds.length >= MAX_PRODUCT_BATCH)} onChange={() => toggle(product.id)} /></TableCell>
                  <TableCell><div className="admin-product-name">{product.images?.[0]?<img src={supabaseAssetUrl(product.images[0])} alt="" loading="lazy" referrerPolicy="no-referrer"/>:<span className="admin-product-placeholder"><Package aria-hidden="true"/></span>}<div><strong>{product.name}</strong><small dir="auto">{product.slug}</small></div></div></TableCell>
                  <TableCell>{categoryFilterLabel(product)}</TableCell>
                  <EditablePriceCell product={product} busy={pending(product.id)} save={changePrice} />
                  <TableCell>
                    <AdminBadge tone={product.is_active?'success':'neutral'}>{product.is_active?'فعال':'پیش‌نویس'}</AdminBadge>
                  </TableCell>
                  <TableCell className="text-left">
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={pending(product.id)} onClick={() => handleDuplicateProduct(product)} title="کپی محصول">
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={pending(product.id)} onClick={() => handleEditProduct(product)} aria-label="ویرایش محصول">
                      <Edit className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div><details className="admin-help"><summary>راهنمای مدیریت محصولات</summary><p>برای توقف فروش، محصول را پیش‌نویس کنید. حذف دائمی محصول و تنوع برای حفظ سابقه بسته است. عملیات گروهی بعد از انتخاب محصول، پیش‌نمایش و تأیید جداگانه دارند.</p></details>
    </div>
  );
}
