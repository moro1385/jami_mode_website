import {supabaseAssetUrl} from '@/lib/supabaseRelay';
import { useEffect, useState } from 'react';
import { signedReturnImage } from '@/lib/returnImages';
import { useAuthStore } from '@/stores/authStore';
export default function PrivateReturnImage({ reference, alt, className, openable = false }:
  { reference: string; alt: string; className?: string; openable?: boolean }) {
  const userId = useAuthStore(s => s.user?.id);
  const [signed, setSigned] = useState<{ reference: string; userId: string; url: string } | null>(null);
  useEffect(() => {
    let active = true, request = 0;
    setSigned(null);
    if (!userId) return;
    const refresh = async () => {
      const current = ++request;
      try {
        const url = await signedReturnImage(reference);
        if (active && current === request) setSigned(url ? { reference, userId, url } : null);
      } catch { if (active && current === request) setSigned(null); }
    };
    void refresh();
    const timer = setInterval(() => void refresh(), 45000);
    return () => { active = false; clearInterval(timer); };
  }, [reference, userId]);
  // Do not render the previous account/reference while its effect is cleaning up.
  const url = signed?.reference === reference && signed.userId === userId ? signed.url : null;
  if (!url) return <span className={className}>تصویر در دسترس نیست</span>;
  const image = <img src={supabaseAssetUrl(url)} alt={alt} className={className} loading="lazy" referrerPolicy="no-referrer" onError={() => setSigned(null)} />;
  return openable ? <a href={supabaseAssetUrl(url)} target="_blank" rel="noopener noreferrer" referrerPolicy="no-referrer">{image}</a> : image;
}
