import { Link } from "react-router-dom";
import { Instagram, Send } from "lucide-react";

export default function Footer() {
  return (
    <footer className="bg-background py-16 px-6">
      <div className="max-w-7xl mx-auto">
        <div className="grid grid-cols-1 md:grid-cols-[2fr_1fr_1fr] gap-12">
          <div>
<Link to="/" className="block mb-4 w-full">
  <img 
    src="/logo.png" 
    alt="جامی مد" 
    className="w-full md:w-80 lg:w-96 aspect-[2/1] object-cover object-center rounded-xl md:rounded-2xl shadow-xs mx-auto"
    loading="lazy"
    width={384}
    height={192}
  />

  <a 
  referrerPolicy="origin" 
  target="_blank" 
  href="https://trustseal.enamad.ir/?id=7744824&Code=9OTe2M4698F0OP4esQoF6tv5Y7lcIMjq"
>
  <img 
    referrerPolicy="origin" 
    src="https://trustseal.enamad.ir/logo.aspx?id=7744824&Code=9OTe2M4698F0OP4esQoF6tv5Y7lcIMjq" 
    alt="نماد اعتماد الکترونیکی" 
    style={{ cursor: "pointer" }} 
    id="9OTe2M4698F0OP4esQoF6tv5Y7lcIMjq" 
    loading="lazy"
  />
</a>
</Link>
            <p>مهم ترین نیاز های روزمره خود را با بیشترین کیفیت از جامی مد تهیه کنید</p>
            <div className="flex gap-4 mt-6">
              <a href="https://www.instagram.com/jami_modee?igsi=Z2N2cXdwNWZpeDRw&utm_source=qr" target="_blank" rel="noopener noreferrer" aria-label="Instagram" className="p-3 -m-3">
                <Instagram className="w-[18px] h-[18px] text-muted-foreground hover:text-foreground transition-colors" />
              </a>
              <a href="https://t.me/foroshgahejamaly" target="_blank" rel="noopener noreferrer" aria-label="Telegram" className="p-3 -m-3">
                <Send className="w-[18px] h-[18px] text-muted-foreground hover:text-foreground transition-colors" />
              </a>
            </div>
            <div className="mt-6 space-y-2 text-sm text-muted-foreground">
              <p>تلفن پشتیبانی: 2859 458 0914</p>
              <p>آدرس : تبریز - بازار بزرگ تربیت - بازار شیخ صفی - طبقه اول - پلاک 58 </p>
            </div>
          </div>
          <div>
            <h4 className="text-base font-semibold text-foreground mb-4">دسترسی سریع</h4>
            <div className="flex flex-col gap-3">
              <Link to="/" className="text-sm text-muted-foreground hover:text-foreground transition-colors">خانه</Link>
              <Link to="/shop" className="text-sm text-muted-foreground hover:text-foreground transition-colors">فروشگاه</Link>
              <Link to="/about" className="text-sm text-muted-foreground hover:text-foreground transition-colors">درباره ما</Link>
              <Link to="/contact" className="text-sm text-muted-foreground hover:text-foreground transition-colors">تماس با ما</Link>
              <Link to="/wholesale" className="text-sm text-muted-foreground hover:text-foreground transition-colors">فروش عمده</Link>
              <Link to="/address" className="text-sm text-muted-foreground hover:text-foreground transition-colors">آدرس</Link>
            </div>
          </div>
          <div>
            <h4 className="text-base font-semibold text-foreground mb-4">خدمات مشتریان</h4>
            <div className="flex flex-col gap-3">
              <Link to="/privacy-policy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">حریم خصوصی</Link>
              <Link to="/terms" className="text-sm text-muted-foreground hover:text-foreground transition-colors">قوانین و مقررات</Link>
              <Link to="/size-guide" className="text-sm text-muted-foreground hover:text-foreground transition-colors">راهنمای سایز</Link>
              <Link to="/return-policy" className="text-sm text-muted-foreground hover:text-foreground transition-colors">شرایط مرجوعی</Link>
              <Link to="/faq" className="text-sm text-muted-foreground hover:text-foreground transition-colors">سوالات متداول</Link>
              <Link to="/order-tracking" className="text-sm text-muted-foreground hover:text-foreground transition-colors">پیگیری سفارش</Link>
            </div>
          </div>
        </div>
      </div>
    </footer>
  );
}
