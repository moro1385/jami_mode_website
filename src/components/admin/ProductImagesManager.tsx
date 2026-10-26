import {supabaseAssetUrl} from '@/lib/supabaseRelay';
import { useAuthStore } from '@/stores/authStore';
import { useProductImages } from '@/features/catalog/presentation/useProductImages';
import { ReadFailure } from '@/shared/presentation/ReadFailure';
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Trash2, Upload, Loader2, Image as ImageIcon } from "lucide-react";


interface ProductImagesManagerProps {
  productId: string;
}

export function ProductImagesManager({ productId }: ProductImagesManagerProps) {
  const ownerId = useAuthStore(state => state.user?.id);
  return <ProductImagesManagerContent key={JSON.stringify([ownerId, productId])} productId={productId} ownerId={ownerId} />;
}

function ProductImagesManagerContent({ productId, ownerId }: ProductImagesManagerProps & { ownerId?: string }) {
  const { images, loading: isLoading, error, retry, busy: isUploading, upload, remove } = useProductImages(ownerId, productId);
  async function handleMultipleFileUploads(event: React.ChangeEvent<HTMLInputElement>) {
    const input = event.currentTarget, files = Array.from(input.files ?? []);
    if (!files.length) return;
    await upload(files); input.value = '';
  }
  function handleDeleteImage(_id: string, imageUrl: string) {
    if (window.confirm('این تصویر حذف شود؟')) void remove(imageUrl);
  }

  if (isLoading) {
    return (
      <div className="flex justify-center p-4">
        <Loader2 className="w-6 h-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (error) return <ReadFailure retry={retry} message="بارگیری تصاویر با شکست مواجه شد." />;
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
              <img src={supabaseAssetUrl(img.image_url)} alt={img.alt_text || "Product image"} className="w-full aspect-square object-cover" loading="lazy" />
              <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                <Button
                  variant="destructive"
                  size="icon"
                  disabled={isUploading}
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
