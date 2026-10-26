import { InventoryAdjustmentControls } from '@/features/inventory/presentation/InventoryAdjustmentControls';
import type { AdjustmentRow } from '@/features/inventory/domain/adjustments';
import { useAuthStore } from '@/stores/authStore';
import { useProductVariants } from '@/features/catalog/presentation/useProductVariants';
import { ReadFailure } from '@/shared/presentation/ReadFailure';
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Plus, Loader2 } from "lucide-react";
import { toast } from "sonner";


interface ProductVariantsManagerProps {
  productId: string;
}

export function ProductVariantsManager({ productId }: ProductVariantsManagerProps) {
  const ownerId = useAuthStore(state => state.user?.id);
  return <ProductVariantsManagerContent key={JSON.stringify([ownerId, productId])} productId={productId} ownerId={ownerId} />;
}

function ProductVariantsManagerContent({ productId, ownerId }: ProductVariantsManagerProps & { ownerId?: string }) {
  const { variants, loading: isLoading, error, retry, editing, busy, update: handleUpdateVariant, add } = useProductVariants(ownerId, productId);

  const [adjustmentRow, setAdjustmentRow] = useState<AdjustmentRow | null>(null);
  const locked = busy || !!adjustmentRow || isLoading || !!error;

  // New variants begin at zero; stock is changed only through audited adjustments.
  const [newVariant, setNewVariant] = useState({
    size: "",
    color: "",
    price: "",
    stock_quantity: "0",
    sku: "",
  });

  async function handleAddVariant() {
    if (!newVariant.size && !newVariant.color) { toast.error('حداقل وارد کردن سایز یا رنگ برای تنوع الزامی است.'); return; }
    if (await add(newVariant)) setNewVariant({ size: '', color: '', price: '', stock_quantity: '0', sku: '' });
  }

  if (isLoading && !adjustmentRow) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error && !adjustmentRow) return <ReadFailure retry={retry} message="بارگیری تنوع‌ها با شکست مواجه شد." />;
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">تنوع‌ها</h3>
      <p className="text-sm text-muted-foreground">برای تغییر موجودی، «اصلاح و تاریخچه» را باز کنید و دلیل بنویسید. تنوع تازه با موجودی صفر ساخته می‌شود.</p>
      {adjustmentRow && ownerId && <InventoryAdjustmentControls ownerId={ownerId} row={adjustmentRow}
        close={() => setAdjustmentRow(null)} refresh={retry} />}
      {isLoading && <p role="status">در حال بازخوانی تنوع‌ها…</p>}
      {error && <ReadFailure retry={retry} message="بارگیری تنوع‌ها با شکست مواجه شد." />}

      <div className="border rounded-md">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>سایز</TableHead>
              <TableHead>رنگ</TableHead>
              <TableHead>قیمت (اختیاری)</TableHead>
              <TableHead>موجودی</TableHead>
              <TableHead>شناسه (اختیاری)</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {variants.map((variant) => (
              <TableRow key={variant.id}>
                <TableCell className="p-2">
                  <Input disabled={locked}
                    value={variant.size || ""}
                    onChange={(e) => handleUpdateVariant(variant.id, 'size', e.target.value)}
                    className="h-8"
                    placeholder="S"
                  />
                </TableCell>
                <TableCell className="p-2">
                  <Input disabled={locked}
                    value={variant.color || ""}
                    onChange={(e) => handleUpdateVariant(variant.id, 'color', e.target.value)}
                    className="h-8"
                    placeholder="Red"
                  />
                </TableCell>
                <TableCell className="p-2">
                  <Input disabled={locked}
                    type="number"
                    step="0.01"
                    value={variant.price || ""}
                    onChange={(e) => handleUpdateVariant(variant.id, 'price', parseFloat(e.target.value) || null)}
                    className="h-8"
                    placeholder="29.99"
                  />
                </TableCell>
                <TableCell className="p-2">
                  <span>{Number.isInteger(variant.stock_quantity) && variant.stock_quantity >= 0 ? variant.stock_quantity : 'نامعتبر'}</span>
                  <Button type="button" variant="outline" size="sm" disabled={locked || editing || !ownerId}
                    onClick={() => setAdjustmentRow({productId, productName: 'تنوع محصول', variantId: variant.id,
                      sku: variant.sku, size: variant.size, color: variant.color,
                      quantity: Number.isInteger(variant.stock_quantity) && variant.stock_quantity >= 0 && variant.stock_quantity <= 2147483647 ? variant.stock_quantity : null})}>
                    اصلاح و تاریخچه
                  </Button>
                </TableCell>
                <TableCell className="p-2">
                  <Input disabled={locked}
                    value={variant.sku || ""}
                    onChange={(e) => handleUpdateVariant(variant.id, 'sku', e.target.value)}
                    className="h-8"
                    placeholder="SKU-123"
                  />
                </TableCell>
                <TableCell className="p-2 text-left">
                  <span className="text-xs text-muted-foreground">حذف دائمی بسته است</span>
                </TableCell>
              </TableRow>
            ))}

            {/* New Variant Row */}
            <TableRow className="bg-muted/30">
              <TableCell className="p-2">
                <Input disabled={locked}
                  value={newVariant.size}
                  onChange={(e) => setNewVariant({...newVariant, size: e.target.value})}
                  className="h-8 bg-background"
                  placeholder="سایز جدید"
                />
              </TableCell>
              <TableCell className="p-2">
                <Input disabled={locked}
                  value={newVariant.color}
                  onChange={(e) => setNewVariant({...newVariant, color: e.target.value})}
                  className="h-8 bg-background"
                  placeholder="رنگ جدید"
                />
              </TableCell>
              <TableCell className="p-2">
                <Input disabled={locked}
                  type="number"
                  step="0.01"
                  value={newVariant.price}
                  onChange={(e) => setNewVariant({...newVariant, price: e.target.value})}
                  className="h-8 bg-background"
                  placeholder="قیمت (سفارشی)"
                />
              </TableCell>
              <TableCell className="p-2">
                <span>شروع با موجودی صفر</span>
              </TableCell>
              <TableCell className="p-2">
                <Input disabled={locked}
                  value={newVariant.sku}
                  onChange={(e) => setNewVariant({...newVariant, sku: e.target.value})}
                  className="h-8 bg-background"
                  placeholder="شناسه"
                />
              </TableCell>
              <TableCell className="p-2 text-left">
                <Button type="button" aria-label="افزودن تنوع با موجودی صفر" variant="ghost" size="icon" className="h-8 w-8 text-primary" disabled={locked || editing} onClick={handleAddVariant}>
                  <Plus className="h-4 w-4" />
                </Button>
              </TableCell>
            </TableRow>
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
