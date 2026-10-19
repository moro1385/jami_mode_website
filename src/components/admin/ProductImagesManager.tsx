import { errorMessage } from "@/lib/errors";
import { useState, useEffect } from "react";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Upload, Loader2, Image as ImageIcon } from "lucide-react";
import { toast } from "sonner";
import type { Database } from "@/integrations/supabase/types";

type ProductImage = Database["public"]["Tables"]["product_images"]["Row"];

interface ProductImagesManagerProps {
  productId: string;
}

export function ProductImagesManager({ productId }: ProductImagesManagerProps) {
  const [images, setImages] = useState<ProductImage[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isUploading, setIsUploading] = useState(false);

  useEffect(() => {
    fetchImages();
  }, [productId]);

  async function fetchImages() {
    setIsLoading(true);
    try {
      const { data, error } = await supabase
        .from("products")
        .select("images")
        .eq("id", productId)
        .single();

      if (error) throw error;

      const parsedImages = (data.images || []).map((url, i) => ({
        id: url,
        product_id: productId,
        image_url: url,
        sort_order: i,
        alt_text: null,
        created_at: new Date().toISOString(),
      }));
      setImages(parsedImages);
    } catch (err: unknown) {
      console.error("Error fetching images:", err);
      toast.error(errorMessage(err, "Failed to load images"));
    } finally {
      setIsLoading(false);
    }
  }

  async function handleMultipleFileUploads(event: React.ChangeEvent<HTMLInputElement>) {
    const files = event.target.files;
    if (!files || files.length === 0) return;

    setIsUploading(true);
    try {
      const uploadedUrls: string[] = [];

      for (let i = 0; i < files.length; i++) {
        const file = files[i];
        const fileExt = file.name.split('.').pop();
        const fileName = `${productId}-${Math.random()}.${fileExt}`;

        const { error: uploadError } = await supabase.storage
          .from("product-images")
          .upload(fileName, file);

        if (uploadError) throw uploadError;

        const { data: { publicUrl } } = supabase.storage
          .from("product-images")
          .getPublicUrl(fileName);

        uploadedUrls.push(publicUrl);
      }

      // 3. Insert into Database (Products table array)
      const currentImagesUrls = images.map(i => i.image_url);
      const newImagesUrls = [...currentImagesUrls, ...uploadedUrls];

      const { error: dbError } = await supabase
        .from("products")
        .update({ images: newImagesUrls })
        .eq("id", productId);

      if (dbError) throw dbError;

      const newImageObjects = uploadedUrls.map((url, i) => ({
        id: url,
        product_id: productId,
        image_url: url,
        sort_order: images.length + i,
        alt_text: null,
        created_at: new Date().toISOString(),
      }));

      setImages([...images, ...newImageObjects]);
      toast.success("تصاویر با موفقیت بارگذاری شدند");
    } catch (err) {
      console.error("Error uploading image:", err);
      toast.error(err instanceof Error ? err.message : "بارگذاری تصویر با شکست مواجه شد");
    } finally {
      setIsUploading(false);
      event.target.value = '';
    }
  }

  async function handleFileUpload(event: React.ChangeEvent<HTMLInputElement>) {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsUploading(true);
    try {
      // 1. Upload to Storage
      const fileExt = file.name.split('.').pop();
      const fileName = `${productId}-${Math.random()}.${fileExt}`;
      const filePath = `${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from("product-images")
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      // 2. Get Public URL
      const { data: { publicUrl } } = supabase.storage
        .from("product-images")
        .getPublicUrl(filePath);

      // 3. Insert into Database (Products table array)
      const currentImagesUrls = images.map(i => i.image_url);
      const newImagesUrls = [...currentImagesUrls, publicUrl];

      const { error: dbError } = await supabase
        .from("products")
        .update({ images: newImagesUrls })
        .eq("id", productId);

      if (dbError) throw dbError;

      const imgData = {
        id: publicUrl,
        product_id: productId,
        image_url: publicUrl,
        sort_order: images.length,
        alt_text: null,
        created_at: new Date().toISOString(),
      };
      setImages([...images, imgData]);
      toast.success("تصویر با موفقیت بارگذاری شد");
    } catch (err: unknown) {
      console.error("Error uploading image:", err);
      toast.error(errorMessage(err, "بارگذاری تصویر با شکست مواجه شد"));
    } finally {
      setIsUploading(false);
      // Reset input
      event.target.value = '';
    }
  }

  async function handleDeleteImage(id: string, imageUrl: string) {
    if (!window.confirm("این تصویر حذف شود؟")) return;

    try {
      // Delete from DB first
      const currentImagesUrls = images.map(i => i.image_url);
      const newImagesUrls = currentImagesUrls.filter(url => url !== imageUrl);

      const { error: dbError } = await supabase
        .from("products")
        .update({ images: newImagesUrls })
        .eq("id", productId);

      if (dbError) throw dbError;

      setImages(images.filter((img) => img.image_url !== imageUrl));
      toast.success("تصویر حذف شد");

      // Attempt to delete from storage (extract filename from URL)
      try {
        const urlObj = new URL(imageUrl);
        const pathSegments = urlObj.pathname.split('/');
        const fileName = pathSegments[pathSegments.length - 1];
        if (fileName) {
           await supabase.storage.from("product-images").remove([fileName]);
        }
      } catch (e) {
        console.error("Failed to delete from storage", e);
      }

    } catch (err: unknown) {
      console.error("Error deleting image:", err);
      toast.error(errorMessage(err, "حذف تصویر با شکست مواجه شد"));
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
      <div className="flex items-center justify-between">
        <h3 className="text-lg font-medium">تصاویر</h3>
        <div>
           <Input
             type="file"
             accept="image/*"
             id="image-upload"
             className="hidden"
             multiple
             onChange={handleMultipleFileUploads}
             disabled={isUploading}
           />
           <label htmlFor="image-upload">
             <Button variant="outline" size="sm" className="cursor-pointer" asChild disabled={isUploading}>
               <span>
                 {isUploading ? <Loader2 className="w-4 h-4 ml-2 animate-spin" /> : <Upload className="w-4 h-4 ml-2" />}
                 بارگذاری تصویر
               </span>
             </Button>
           </label>
        </div>
      </div>

      {images.length === 0 ? (
        <div className="border border-dashed rounded-md p-8 text-center text-muted-foreground flex flex-col items-center justify-center">
          <ImageIcon className="w-8 h-8 mb-2 opacity-50" />
          هنوز تصویری بارگذاری نشده است.
        </div>
      ) : (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
          {images.map((img) => (
            <div key={img.id} className="relative group rounded-md overflow-hidden border">
              <img src={img.image_url} alt={img.alt_text || "Product image"} className="w-full aspect-square object-cover" loading="lazy" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Button
                  variant="destructive"
                  size="icon"
                  onClick={() => handleDeleteImage(img.id, img.image_url)}
                >
                  <Trash2 className="w-4 h-4" />
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
