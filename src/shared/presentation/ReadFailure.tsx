import { Button } from '@/components/ui/button';
export function ReadFailure({ retry, message = 'دریافت اطلاعات انجام نشد. دوباره تلاش کنید.' }: { retry: () => void; message?: string }) {
 return <div role="alert" className="p-6 text-center space-y-3"><p>{message}</p><Button variant="outline" onClick={retry}>تلاش دوباره</Button></div>;
}
