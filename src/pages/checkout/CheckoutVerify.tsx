import { useEffect, useRef } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { supabase } from "@/integrations/supabase/client";

export default function CheckoutVerify() {
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const calledRef = useRef(false);

  useEffect(() => {
    if (calledRef.current) return;
    calledRef.current = true;

    const order_id = searchParams.get("order_id");
    const trans_id = searchParams.get("trans_id");
    const id_get = searchParams.get("id_get");

    if (!order_id) {
      navigate("/checkout/failed?reason=invalid", { replace: true });
      return;
    }

    async function verifyPayment() {
      try {
        const { data: sessionData } = await supabase.auth.getSession();
        const response = await fetch("/api/bitpay/verify", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${sessionData.session?.access_token}`
          },
          body: JSON.stringify({ order_id, trans_id, id_get })
        });
        const data = await response.json();
        const error = !response.ok ? new Error('Fetch error') : null;

        if (error) {
          navigate(`/checkout/failed?order=${order_id}&reason=error`, { replace: true });
          return;
        }

        if (data?.success) {
          // A completed purchase may be followed by a new identical cart. Clear
          // only after server-confirmed settlement, never on the success URL.
          const user = sessionData.session?.user;
          if (user) sessionStorage.removeItem('trusted-checkout:' + user.id);
          navigate(`/checkout/success?order=${order_id}`, { replace: true });
        } else {
          const reason = data?.reason || "error";
          navigate(`/checkout/failed?order=${order_id}&reason=${reason}`, { replace: true });
        }
      } catch (err) {
        console.error("Verification network error:", err);
        navigate(`/checkout/failed?order=${order_id}&reason=error`, { replace: true });
      }
    }

    verifyPayment();
  }, [navigate, searchParams]);

  return (
    <div className="max-w-4xl mx-auto px-6 py-24 min-h-[60vh] flex flex-col items-center justify-center text-center">
      <Loader2 className="w-16 h-16 text-muted-foreground animate-spin mb-6" />
      <h1 className="text-xl font-medium text-foreground">
        در حال بررسی پرداخت...
      </h1>
      <p className="text-muted-foreground mt-4 text-sm">
        لطفاً شکیبا باشید و این صفحه را نبندید.
      </p>
    </div>
  );
}
