import { supabase } from '@/integrations/supabase/client';
import { completePendingSignup, saveProfileEdits } from '@/lib/profileWrites';
import { createAuthService } from './application/authService';
import { createSupabaseAuthRepository } from './infrastructure/supabaseAuthRepository';
export const authService = createAuthService(createSupabaseAuthRepository(supabase), {
  complete: completePendingSignup, saveEdits: saveProfileEdits,
}, {
  getItem: key => sessionStorage.getItem(key),
  setItem: (key, value) => sessionStorage.setItem(key, value),
  removeItem: key => sessionStorage.removeItem(key),
}, error => console.error('Failed to save signup profile', error));
