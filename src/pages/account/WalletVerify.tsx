import { Loader2 } from "lucide-react";
import { usePaymentCallback } from "@/features/payments/presentation/usePaymentCallback";

export default function WalletVerify() {
  usePaymentCallback('wallet');

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
