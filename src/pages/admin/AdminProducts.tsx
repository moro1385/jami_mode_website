import { errorMessage } from "@/lib/errors";
import { useEffect, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Button } from "@/components/ui/button";
import { Plus, Edit, Trash2, Loader2, Copy } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";
import { ProductFormDialog } from "@/components/admin/ProductFormDialog";
import { slugify } from "@/lib/slugify";
import { Input } from "@/components/ui/input";

type Product = Database["public"]["Tables"]["products"]["Row"];

function EditablePriceCell({ product, onSuccess }: { product: Product, onSuccess: () => void }) {
  const [isEditing, setIsEditing] = useState(false);
  const [currentPrice, setCurrentPrice] = useState(product.price);
  const [editValue, setEditValue] = useState(currentPrice?.toString() || "");
  const [isSaving, setIsSaving] = useState(false);

  useEffect(() => {
    setCurrentPrice(product.price);
    setEditValue(product.price?.toString() || "");
  }, [product.price]);

  const handleSave = async () => {
    if (isSaving) return;

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

    setIsSaving(true);
    try {
      const { error } = await supabase
        .from("products")
        .update({ price: numericPrice })
        .eq("id", product.id);

      if (error) throw error;
      toast.success("قیمت با موفقیت بروزرسانی شد");
      setCurrentPrice(numericPrice);
      onSuccess();
    } catch (err: unknown) {
      console.error("Error updating price:", err);
      toast.error(errorMessage(err, "بروزرسانی قیمت با شکست مواجه شد"));
      setEditValue(currentPrice?.toString() || "");
    } finally {
      setIsSaving(false);
      setIsEditing(false);
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
          disabled={isSaving}
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
      onClick={() => setIsEditing(true)}
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
  const [products, setProducts] = useState<Product[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [editingProduct, setEditingProduct] = useState<Product | null>(null);

  useEffect(() => {
    fetchProducts();
  }, []);

  const handleAddProduct = () => {
    setEditingProduct(null);
    setIsDialogOpen(true);
  };

  const handleEditProduct = (product: Product) => {
    setEditingProduct(product);
    setIsDialogOpen(true);
  };

  const handleDeleteProduct = async (id: string) => {
    if (!window.confirm("آیا مطمئن هستید که می‌خواهید این محصول را حذف کنید؟")) return;

    try {
      const { error } = await supabase.from("products").delete().eq("id", id);
      if (error) throw error;
      toast.success("محصول با موفقیت حذف شد");
      fetchProducts();
    } catch (err: unknown) {
      console.error("Error deleting product:", err);
      toast.error(errorMessage(err, "حذف محصول با شکست مواجه شد"));
    }
  };

  const handleDuplicateProduct = async (product: Product) => {
    try {
      const { id, created_at, ...rest } = product;
      const duplicatedData = { ...rest };
      duplicatedData.name = `${product.name} - کپی`;
      duplicatedData.slug = slugify(duplicatedData.name);
      duplicatedData.images = [];

      const { error } = await supabase.from("products").insert([duplicatedData]);

      if (error) {
        if (error.code === "23505" || (error.message && error.message.includes("products_slug_key"))) {
          toast.error("این نامک (Slug) قبلاً برای محصول دیگری استفاده شده — لطفاً کمی تغییرش بده.");
        } else {
          throw error;
        }
      } else {
        toast.success("محصول با موفقیت کپی شد");
        fetchProducts();
      }
    } catch (err: unknown) {
      console.error("Error duplicating product:", err);
      toast.error(errorMessage(err, "کپی محصول با شکست مواجه شد"));
    }
  };

  async function fetchProducts() {
    setIsLoading(true);
    setError(null);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("*")
        .order("created_at", { ascending: false });

      if (error) throw error;
      setProducts(data || []);
    } catch (err) {
      console.error("Error fetching products:", err);
      setError("بارگیری محصولات با شکست مواجه شد.");
    } finally {
      setIsLoading(false);
    }
  }

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
          <div className="p-8 text-center text-destructive">
            {error}
          </div>
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
                  <EditablePriceCell product={product} onSuccess={fetchProducts} />
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
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleDuplicateProduct(product)} title="کپی محصول">
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleEditProduct(product)}>
                      <Edit className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive hover:text-destructive hover:bg-destructive/10" onClick={() => handleDeleteProduct(product.id)}>
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
