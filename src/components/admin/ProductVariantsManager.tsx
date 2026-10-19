import { errorMessage } from "@/lib/errors";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Trash2, Plus, Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type ProductVariant = Database["public"]["Tables"]["product_variants"]["Row"];

interface ProductVariantsManagerProps {
  productId: string;
}

export function ProductVariantsManager({ productId }: ProductVariantsManagerProps) {
  const [variants, setVariants] = useState<ProductVariant[]>([]);
  const [isLoading, setIsLoading] = useState(true);

  // State for new variant form
  const [newVariant, setNewVariant] = useState({
    size: "",
    color: "",
    price: "",
    stock_quantity: "0",
    sku: "",
  });

  useEffect(() => {
    fetchVariants();
  }, [productId]);

  async function fetchVariants() {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("product_variants")
        .select("*")
        .eq("product_id", productId)
        .order("created_at", { ascending: true });

      if (error) throw error;
      setVariants(data || []);
    } catch (err: unknown) {
      console.error("Error fetching variants:", err);
      toast.error(errorMessage(err, "بارگیری تنوع‌ها با شکست مواجه شد"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleAddVariant() {
    if (!newVariant.size && !newVariant.color) {
      toast.error("حداقل وارد کردن سایز یا رنگ برای تنوع الزامی است.");
      return;
    }

    try {
      const { data, error } = await supabase
        .from("product_variants")
        .insert({
          product_id: productId,
          size: newVariant.size || null,
          color: newVariant.color || null,
          price: newVariant.price ? parseFloat(newVariant.price) : null,
          stock_quantity: parseInt(newVariant.stock_quantity) || 0,
          sku: newVariant.sku || null,
        })
        .select()
        .single();

      if (error) throw error;

      setVariants([...variants, data]);
      setNewVariant({ size: "", color: "", price: "", stock_quantity: "0", sku: "" });
      toast.success("تنوع اضافه شد");
    } catch (err: unknown) {
      console.error("Error adding variant:", err);
      toast.error(errorMessage(err, "افزودن تنوع با شکست مواجه شد"));
    }
  }

  async function handleDeleteVariant(id: string) {
    if (!window.confirm("این تنوع حذف شود؟")) return;

    try {
      const { error } = await supabase.from("product_variants").delete().eq("id", id);
      if (error) throw error;

      setVariants(variants.filter((v) => v.id !== id));
      toast.success("تنوع حذف شد");
    } catch (err: unknown) {
      console.error("Error deleting variant:", err);
      toast.error(errorMessage(err, "حذف تنوع با شکست مواجه شد"));
    }
  }

  async function handleUpdateVariant<K extends 'size' | 'color' | 'sku' | 'price' | 'stock_quantity'>(id: string, field: K, value: ProductVariant[K]) {
    try {
      const update: Database['public']['Tables']['product_variants']['Update'] = { [field]: value === '' ? null : value };
      // Optimistic update in UI for typing
      setVariants(variants.map(v => v.id === id ? { ...v, [field]: value } : v));

      const { error } = await supabase
        .from("product_variants")
        .update(update)
        .eq("id", id);

      if (error) throw error;
    } catch (err: unknown) {
      console.error("Error updating variant:", err);
      // Fallback
      fetchVariants();
    }
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

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
                  <Input
                    value={variant.size || ""}
                    onChange={(e) => handleUpdateVariant(variant.id, 'size', e.target.value)}
                    className="h-8"
                    placeholder="S"
                  />
                </TableCell>
                <TableCell className="p-2">
                  <Input
                    value={variant.color || ""}
                    onChange={(e) => handleUpdateVariant(variant.id, 'color', e.target.value)}
                    className="h-8"
                    placeholder="Red"
                  />
                </TableCell>
                <TableCell className="p-2">
                  <Input
                    type="number"
                    step="0.01"
                    value={variant.price || ""}
                    onChange={(e) => handleUpdateVariant(variant.id, 'price', parseFloat(e.target.value) || null)}
                    className="h-8"
                    placeholder="29.99"
                  />
                </TableCell>
                <TableCell className="p-2">
                  <Input
                    type="number"
                    value={variant.stock_quantity}
                    onChange={(e) => handleUpdateVariant(variant.id, 'stock_quantity', parseInt(e.target.value) || 0)}
                    className="h-8"
                  />
                </TableCell>
                <TableCell className="p-2">
                  <Input
                    value={variant.sku || ""}
                    onChange={(e) => handleUpdateVariant(variant.id, 'sku', e.target.value)}
                    className="h-8"
                    placeholder="SKU-123"
                  />
                </TableCell>
                <TableCell className="p-2 text-left">
                  <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => handleDeleteVariant(variant.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </TableCell>
              </TableRow>
            ))}

            {/* New Variant Row */}
            <TableRow className="bg-muted/30">
              <TableCell className="p-2">
                <Input
                  value={newVariant.size}
                  onChange={(e) => setNewVariant({...newVariant, size: e.target.value})}
                  className="h-8 bg-background"
                  placeholder="سایز جدید"
                />
              </TableCell>
              <TableCell className="p-2">
                <Input
                  value={newVariant.color}
                  onChange={(e) => setNewVariant({...newVariant, color: e.target.value})}
                  className="h-8 bg-background"
                  placeholder="رنگ جدید"
                />
              </TableCell>
              <TableCell className="p-2">
                <Input
                  type="number"
                  step="0.01"
                  value={newVariant.price}
                  onChange={(e) => setNewVariant({...newVariant, price: e.target.value})}
                  className="h-8 bg-background"
                  placeholder="قیمت (سفارشی)"
                />
              </TableCell>
              <TableCell className="p-2">
                <Input
                  type="number"
                  value={newVariant.stock_quantity}
                  onChange={(e) => setNewVariant({...newVariant, stock_quantity: e.target.value})}
                  className="h-8 bg-background"
                />
              </TableCell>
              <TableCell className="p-2">
                <Input
                  value={newVariant.sku}
                  onChange={(e) => setNewVariant({...newVariant, sku: e.target.value})}
                  className="h-8 bg-background"
                  placeholder="شناسه"
                />
              </TableCell>
              <TableCell className="p-2 text-left">
                <Button variant="ghost" size="icon" className="h-8 w-8 text-primary" onClick={handleAddVariant}>
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
