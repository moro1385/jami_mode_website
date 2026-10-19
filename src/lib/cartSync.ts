import { supabase } from "@/integrations/supabase/client";
import { useCartStore } from "@/stores/cartStore";
import { z } from 'zod';

const cartItemSchema = z.object({
  id: z.string(), productId: z.string(), productTitle: z.string(),
  productHandle: z.string(), image: z.string(),
  price: z.object({ amount: z.string(), currencyCode: z.string() }),
  quantity: z.number().int().positive().max(100),
  selectedSize: z.string().nullable(), selectedColor: z.string().nullable(),
});

export function parseCartItems(value: unknown) {
  const parsed = z.array(cartItemSchema).max(100).safeParse(value);
  return parsed.success ? parsed.data.map(item => ({
    id: item.id, productId: item.productId, productTitle: item.productTitle,
    productHandle: item.productHandle, image: item.image,
    price: { amount: item.price.amount, currencyCode: item.price.currencyCode },
    quantity: item.quantity, selectedSize: item.selectedSize, selectedColor: item.selectedColor,
  })) : [];
}

export async function flushCartToServer(userId: string): Promise<void> {
  const items = useCartStore.getState().items;
  const { error } = await supabase.from("carts").upsert({
    user_id: userId,
    items: items.map(item => ({ ...item, price: { ...item.price } })),
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("Error flushing cart to server:", error);
  }
}
