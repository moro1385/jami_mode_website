import { useAuthStore } from '@/stores/authStore';
import { useAdminProducts } from '@/features/catalog/presentation/useAdminProducts';
import { ReadFailure } from '@/shared/presentation/ReadFailure';
import { useRequestScope } from '@/shared/presentation/useRequestScope';
import { errorMessage } from "@/lib/errors";
import { useEffect, useState } from "react";
import type { AdminProduct as Product } from "@/features/catalog/admin";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, Loader2, Copy } from "lucide-react";
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
  const { products, loading: isLoading, error, retry: fetchProducts, pending, remove, duplicate: handleDuplicateProduct, changePrice } = useAdminProducts(ownerId);

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

  const handleDeleteProduct = (id: string) => {
    if (window.confirm('آیا مطمئن هستید که می‌خواهید این محصول را حذف کنید؟')) void remove(id);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
        <div>
          <h1 className="text-3xl font-bold tracking-tight">محصولات</h1>
          <p className="text-muted-foreground mt-2">
            محصولات فروشگاه خود را مدیریت کنید.
          </p>
        </div>
        <Button onClick={handleAddProduct}>
          <Plus className="w-4 h-4 ml-2" />
          افزودن محصول
        </Button>
      </div>

      <ProductFormDialog
        open={isDialogOpen}
        onOpenChange={setIsDialogOpen}
        product={editingProduct}
        onSuccess={fetchProducts}
      />

      <div className="bg-background rounded-2xl border">
        {isLoading ? (
          <div className="flex justify-center p-8">
            <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
          </div>
        ) : error ? (
          <ReadFailure retry={fetchProducts} message="بارگیری محصولات با شکست مواجه شد." />
        ) : products.length === 0 ? (
          <div className="p-8 text-center text-muted-foreground">
            هیچ محصولی پیدا نشد. برای شروع یکی اضافه کنید.
          </div>
        ) : (
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>نام</TableHead>
                <TableHead>شناسه</TableHead>
                <TableHead>قیمت</TableHead>
                <TableHead>وضعیت</TableHead>
                <TableHead className="text-left">عملیات</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {products.map((product) => (
                <TableRow key={product.id}>
                  <TableCell className="font-medium">{product.name}</TableCell>
                  <TableCell className="text-muted-foreground">{product.slug}</TableCell>
                  <EditablePriceCell product={product} busy={pending(product.id)} save={changePrice} />
                  <TableCell>
                    {product.is_active ? (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-green-100 text-green-700">
                        فعال
                      </span>
                    ) : (
                      <span className="inline-flex items-center px-2 py-1 rounded-full text-xs font-medium bg-gray-100 text-gray-700">
                        پیش‌نویس
                      </span>
                    )}
                  </TableCell>
                  <TableCell className="text-left">
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={pending(product.id)} onClick={() => handleDuplicateProduct(product)} title="کپی محصول">
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" disabled={pending(product.id)} onClick={() => handleEditProduct(product)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" disabled={pending(product.id)} onClick={() => handleDeleteProduct(product.id)}>
                      <Trash2 className="h-4 w-4" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        )}
      </div>
    </div>
  );
}
