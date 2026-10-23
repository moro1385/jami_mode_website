export interface CustomerSummary {
  id: string;
  created_at: string;
  first_name: string | null;
  last_name: string | null;
  phone: string | null;
}

export function customerDisplayName(users: CustomerSummary[], userId: string): string {
  const user = users.find(item => item.id === userId);
  if (!user) return userId;
  const fullName = [user.first_name, user.last_name].filter(Boolean).join(' ');
  return fullName ? `${fullName} — ${user.phone || 'بدون شماره'}` : (user.phone || user.id);
}
