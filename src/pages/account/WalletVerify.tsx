import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function WalletVerify() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const topup_id = searchParams.get("topup_id");
    const trans_id = searchParams.get("trans_id");
    const id_get = searchParams.get("id_get");

    if (!topup_id) {
      navigate("/account/wallet?topup=failed", { replace: true });
      return;
    }

    async function verifyPayment() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const response = await fetch("/api/bitpay/wallet-verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${sessionData.session?.access_token}`
          },
          body: JSON.stringify({ topup_id, trans_id, id_get })
        });
        const data = await response.json();
        // A successful callback still leads to an independently checked receipt.
        const state = response.ok && data?.reason === 'cancelled' ? 'cancelled' : 'pending';
        navigate(`/account/wallet?topup=${state}&topupId=${encodeURIComponent(topup_id!)}`, { replace: true });
      } catch {
        navigate(`/account/wallet?topup=pending&topupId=${encodeURIComponent(topup_id!)}`, { replace: true });
      }
    }

    verifyPayment();
  }, [navigate, searchParams]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-24 min-h-[60vh] flex flex-col items-center justify-center text-center">
      <Loader2 className="w-16 h-16 text-muted-foreground animate-spin mb-6" />
      <h1 className="text-xl font-medium text-foreground">
        در حال بررسی تراکنش...
      </h1>
      <p className="text-muted-foreground mt-4 text-sm">
        لطفاً شکیبا باشید و این صفحه را نبندید.
      </p>
    </div>
  );
}
