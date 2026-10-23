import { useAuthStore } from '@/stores/authStore';
import { useProductVariants } from '@/features/catalog/presentation/useProductVariants';
import { ReadFailure } from '@/shared/presentation/ReadFailure';
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Loader2, Save } from "lucide-react";
import { toast } from "sonner";


interface ProductVariantsManagerProps {
  productId: string;
}

export function ProductVariantsManager({ productId }: ProductVariantsManagerProps) {
  const ownerId = useAuthStore(state => state.user?.id);
  return <ProductVariantsManagerContent key={JSON.stringify([ownerId, productId])} productId={productId} ownerId={ownerId} />;
}

function ProductVariantsManagerContent({ productId, ownerId }: ProductVariantsManagerProps & { ownerId?: string }) {
  const { variants, loading: isLoading, error, retry, editing, busy, update: handleUpdateVariant, add, remove } = useProductVariants(ownerId, productId);

  // State for new variant form
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
  function handleDeleteVariant(id: string) {
    if (window.confirm('این تنوع حذف شود؟')) void remove(id);
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) return <ReadFailure retry={retry} message="بارگیری تنوع‌ها با شکست مواجه شد." />;
  return (
    <div className="space-y-4">
      <h3 className="text-lg font-medium">تنوع‌ها</h3>

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
                  <Input disabled={busy}
                    value={variant.size || ""}
                    onChange={(e) => handleUpdateVariant(variant.id, 'size', e.target.value)}
                    className="h-8"
                    placeholder="S"
                  />
                </TableCell>
                <TableCell className="p-2">
                  <Input disabled={busy}
                    value={variant.color || ""}
                    onChange={(e) => handleUpdateVariant(variant.id, 'color', e.target.value)}
                    className="h-8"
                    placeholder="Red"
                  />
                </TableCell>
                <TableCell className="p-2">
                  <Input disabled={busy}
                    type="number"
                    step="0.01"
                    value={variant.price || ""}
                    onChange={(e) => handleUpdateVariant(variant.id, 'price', parseFloat(e.target.value) || null)}
                    className="h-8"
                    placeholder="29.99"
                  />
                </TableCell>
                <TableCell className="p-2">
                  <Input disabled={busy}
                    type="number"
                    value={variant.stock_quantity}
                    onChange={(e) => handleUpdateVariant(variant.id, 'stock_quantity', parseInt(e.target.value) || 0)}
                    className="h-8"
                  />
                </TableCell>
                <TableCell className="p-2">
                  <Input disabled={busy}
                    value={variant.sku || ""}
                    onChange={(e) => handleUpdateVariant(variant.id, 'sku', e.target.value)}
                    className="h-8"
                    placeholder="SKU-123"
                  />
                </TableCell>
                <TableCell className="p-2 text-left">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" disabled={busy || editing} onClick={() => handleDeleteVariant(variant.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}

            {/* New Variant Row */}
            <TableRow className="bg-muted/30">
              <TableCell className="p-2">
                <Input disabled={busy}
                  value={newVariant.size}
                  onChange={(e) => setNewVariant({...newVariant, size: e.target.value})}
                  className="h-8 bg-background"
                  placeholder="سایز جدید"
                />
              </TableCell>
              <TableCell className="p-2">
                <Input disabled={busy}
                  value={newVariant.color}
                  onChange={(e) => setNewVariant({...newVariant, color: e.target.value})}
                  className="h-8 bg-background"
                  placeholder="رنگ جدید"
                />
              </TableCell>
              <TableCell className="p-2">
                <Input disabled={busy}
                  type="number"
                  step="0.01"
                  value={newVariant.price}
                  onChange={(e) => setNewVariant({...newVariant, price: e.target.value})}
                  className="h-8 bg-background"
                  placeholder="قیمت (سفارشی)"
                />
              </TableCell>
              <TableCell className="p-2">
                <Input disabled={busy}
                  type="number"
                  value={newVariant.stock_quantity}
                  onChange={(e) => setNewVariant({...newVariant, stock_quantity: e.target.value})}
                  className="h-8 bg-background"
                />
              </TableCell>
              <TableCell className="p-2">
                <Input disabled={busy}
                  value={newVariant.sku}
                  onChange={(e) => setNewVariant({...newVariant, sku: e.target.value})}
                  className="h-8 bg-background"
                  placeholder="شناسه"
                />
              </TableCell>
              <TableCell className="p-2 text-left">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" disabled={busy || editing} onClick={handleAddVariant}>
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
