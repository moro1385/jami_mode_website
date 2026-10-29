import {Loader2} from 'lucide-react';

export default function PageLoading(){
 return <div role="status" className="flex min-h-[50vh] items-center justify-center gap-3 px-6 py-20 text-muted-foreground">
  <Loader2 aria-hidden="true" className="h-6 w-6 animate-spin motion-reduce:animate-none"/>
  <span>در حال بارگذاری صفحه…</span>
 </div>;
}
