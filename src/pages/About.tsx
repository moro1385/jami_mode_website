import aboutBg from "@/assets/about-bg.jpg";
import { Instagram, Send } from "lucide-react";
import SEO from "@/components/SEO";

export default function About() {
  return (
    <article className="max-w-3xl mx-auto px-6 pt-8 pb-32 text-right">
      <SEO
        title="درباره ما"
        description="داستان ما از یک فروشگاه کوچکی در سال ۱۳۷۵ در بازار بزرگ تبریز آغاز شد."
      />
      {/* Headline */}
      <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-16 leading-tight md:leading-none">
        درباره جامی مد
      </h1>

      {/* First text block */}
      <div className="space-y-6 text-base md:text-lg leading-relaxed text-muted-foreground mb-24 md:leading-7">
        <p>
          داستان ما از یک فروشگاه کوچکی در سال ۱۳۷۵ در بازار بزرگ تبریز آغاز شد. در تمام این سال‌ها، هدف اصلی ما تامین پوشاک باکیفیت و جلب رضایت مشتریان بوده است.
        </p>
        <p>
          اما با گسترش کار و برای اینکه بتوانیم مسیر خرید را برای شما راحت‌تر و سریع‌تر کنیم، در سال ۱۴۰۵ تصمیم گرفتیم شعبه‌ی آنلاین جامی مد را راه‌اندازی کنیم. حالا شما می‌توانید بدون نیاز به مراجعه حضوری و اتلاف وقت، همان کیفیت و تنوعِ همیشگی را به راحتی از هر کجای ایران بررسی و سفارش دهید.
        </p>
      </div>

      {/* Full-width image */}
      <div className="w-full mb-24">
        <img
          src={aboutBg}
          alt="فروشگاه جامی مد"
          className="w-full h-auto object-cover rounded-2xl shadow-xs"
          loading="lazy"
        />
      </div>

      {/* Second text block */}
      <div className="space-y-6 text-base md:text-lg leading-relaxed text-muted-foreground mb-16 md:leading-7">
        
        {/* دقت کن به این h3 کلاس سایز دادم تا بزرگ بشه */}
        <h3 className="text-2xl md:text-3xl font-semibold text-foreground mt-8 mb-4">
          تنوع بی‌نظیر؛ از مصرف روزمره تا تمرینات ورزشی
        </h3>
        
        <p>
          یکی از مهم‌ترین نقاط قوت ما در جامی مد، طیف وسیع و متنوع محصولاتمان است. ما مجموعه‌ای کامل را گرد هم آورده‌ایم تا تمام نیازهای پوشاک پایه و تحرک شما را یک‌جا برطرف کنیم:
        </p>
        
        <ul className="list-disc list-inside space-y-3 pr-4">
          <li>
            <strong className="text-foreground">پوشاک ورزشی (Activewear):</strong> انواع شلوار و شلوارک‌های ورزشیِ منعطف و تنفس‌پذیر که برای سخت‌ترین تمرینات باشگاهی یا پیاده‌روی‌های روزمره طراحی شده‌اند.
          </li>
          <li>
            <strong className="text-foreground">لباس‌های پایه (بیسیک):</strong> مجموعه‌ای کامل و متنوع از انواع جوراب‌های نخی و ورزشی، لباس‌زیر، زیرپوش و ست‌های راحتی.
          </li>
        </ul>
        
        <p>
          تمرکز ما همواره بر روی دوام و کیفیت است. لباس‌هایی که عرضه می‌کنیم از بهترین متریال‌ها (نخ‌پنبه، بامبو و پارچه‌های مرغوب) تهیه شده‌اند تا در استفاده‌ی مداوم و شست‌وشوهای مکرر، فرم و راحتیِ خود را از دست ندهند.
        </p>

        {/* بخش فروش عمده */}
        <h3 className="text-2xl md:text-3xl font-semibold text-foreground mt-12 mb-4">
          فروش عمده و همکاری با همکاران
        </h3>
        <p>
          علاوه بر فروش تکی، جامی مد بستر مناسبی را برای تامین اجناسِ همکاران و فروشندگان عزیز در سراسر کشور فراهم کرده است. اگر مغازه‌دار هستید یا قصد خرید طیف وسیع محصولات ما را به صورت عمده دارید، تنوع بالا و موجودیِ کامل انبار ما این اطمینان را به شما می‌دهد که خریدی مطمئن و پرسود داشته باشید.
        </p>

        {/* بخش تماس با ما */}
        <h3 className="text-xl font-bold text-foreground mt-12 mb-4">
          راه‌های ارتباطی با ما
        </h3>
        <div className="bg-muted/30 border border-border rounded-2xl p-6 space-y-4 text-base">
          <p>
            <strong className="text-foreground ml-2">آدرس فروشگاه حضوری:</strong>
            تبریز - بازار بزرگ تربیت - بازار شیخ صفی - طبقه اول - پلاک 58
          </p>
          <p>
            <strong className="text-foreground ml-2">شماره تماس (پشتیبانی و فروش عمده):</strong>
            <br></br>

            2859 458 0914
            <br></br>
            0040 314 0914
            <br></br>

            2898 553 0413
            <br></br>

            7298 553 0413
          </p>
          <p>
            <div className="flex items-center">
            <strong className="text-foreground ml-2">شبکه‌های اجتماعی:</strong>
            <div className="flex items-center gap-4 mr-2">
              <a 
                href="https://www.instagram.com/jami_modee?igsi=Z2N2cXdwNWZpeDRw&utm_source=qr" 
                target="_blank" 
                rel="noreferrer" 
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                <Instagram className="w-5 h-5" />
              </a>
              <a 
                href="https://t.me/foroshgahejamaly" 
                target="_blank" 
                rel="noreferrer" 
                className="text-muted-foreground hover:text-primary transition-colors"
              >
                <Send className="w-5 h-5" />
              </a>
            </div>
          </div>
          </p>
          <p>
            <strong className="text-foreground ml-2">ساعات کاری:</strong>
            شنبه تا پنجشنبه از ۹ صبح تا ۹ شب
          </p>
        </div>
      </div>

      {/* Attribution */}
      <p className="text-sm text-center text-muted-foreground mt-16 pt-8 border-t border-border">
        مهم‌ترین نیازهای روزمره خود را با بیشترین کیفیت از جامی مد تهیه کنید.
      </p>
    </article>
  );
}