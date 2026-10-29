import { Component, type ReactNode } from 'react';
type Props={children:ReactNode};
type State={failed:boolean};
export class ApplicationErrorBoundary extends Component<Props,State> {
  state:State={failed:false};
  static getDerivedStateFromError():State{return {failed:true};}
  componentDidCatch(){
    // Fixed local event only: do not print exception text, component stack or URL.
    console.error(JSON.stringify({event:'ui_render_failed'}));
  }
  render(){
    if(!this.state.failed)return this.props.children;
    return <main dir="rtl" className="min-h-screen flex items-center justify-center p-6 bg-background text-foreground">
      <div role="alert" className="max-w-md text-center space-y-5">
        <h1 className="text-2xl font-semibold">نمایش صفحه با مشکل روبه‌رو شد</h1>
        <p>صفحه را دوباره بارگذاری کنید. اگر پرداختی را شروع کرده‌اید، پیش از پرداخت دوباره، وضعیت سفارش را بررسی کنید.</p>
        <button type="button" onClick={()=>window.location.reload()} className="rounded-xl bg-primary text-primary-foreground px-6 py-3">بارگذاری دوبارهٔ صفحه</button>
        <p className="text-sm">اگر مشکل ادامه داشت، از بخش ارتباط با ما پیگیری کنید.</p>
      </div>
    </main>;
  }
}
