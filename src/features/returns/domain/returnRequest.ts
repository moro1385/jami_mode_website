export type ReturnRequest = {
  id: string; user_id: string; order_id: string; phone: string; description: string;
  image_urls: string[]; status: string; admin_note: string | null; created_at: string;
  orders: { id: string } | null;
  profiles: { first_name: string | null; last_name: string | null; phone: string | null };
};
export type ReturnSubmission = { user_id: string; order_id: string; phone: string; description: string; image_urls: string[] };
export type ReturnOrder = { id: string; number: string; createdAt: string };
