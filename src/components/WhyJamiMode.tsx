import { Link } from "react-router-dom";
import { Leaf, Package, RefreshCcw, Ruler } from "lucide-react";

const reasons = [
  {
    icon: Leaf,
    title: "مواد اولیه ماندگار و باکیفیت",
    body: "پنبه شانه‌شده، الیاف بامبو و پارچه مودال؛ انتخاب‌شده برای تنفس‌پذیری، لطافت و حفظ فرم اولیه، حتی پس از ده‌ها بار شست‌وشو",
  },
  {
    icon: Ruler,
    title: "سایزبندی دقیق و متناسب با شما",
    body: "تمام مدل‌ها روی فرم‌های واقعی بدن، الگوبرداری و اصلاح می‌شوند؛ به همین دلیل، سایزبندیِ تمامی محصولات ما استاندارد، واقعی و قابل اطمینان است",
  },
  {
    icon: Package,
    title: "تکمیل کمد لباس تنها با یک خرید",
    body: "جوراب، لباس‌زیر، زیرپوش و لباس‌های راحتی و ورزشی، همه در یک‌جا. کشوی لباس‌هایتان را بدون نیاز به گشت‌وگذار بین برندهای مختلف، کامل کنید",
  },
  {
    icon: RefreshCcw,
    title: "مرجوعی آسان و بی‌دردسر",
    body: "از خرید خود کاملاً راضی نیستید؟ تا 10 روز فرصت دارید آن را برگردانید. ما ترجیح می‌دهیم لباسی را بپوشید که واقعاً هر روز دوستش داشته باشید",
  },
];

export default function WhyJamiMode() {
  return (
    <section className="py-24">
      <div className="max-w-7xl mx-auto px-6">
        <div className="max-w-2xl">
          <p className="text-xl text-muted-foreground mb-4">
            چرا jamimode ؟
          </p>
          <h2 className="text-3xl md:text-5xl font-display font-black text-foreground leading-tight md:leading-none">
            از راحتیِ نامرئی تا اوج عملکرد در تمرین
          </h2>
          <p className="mt-6 text-base leading-relaxed text-muted-foreground">
            پایه‌ترین لباس‌های شما، مهم‌ترینِ آن‌ها هستند. چه جورابی که هر روز می‌پوشید و چه شلواری که با آن تمرین می‌کنید، همگی باید از بهترین پارچه‌ها و با دقیق‌ترین دوخت‌ها تهیه شوند. ما کیفیت را نه فقط در ظاهر، بلکه در احساسی که روی پوستتان دارید معنا می‌کنیم
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-10 mt-16">
          {reasons.map((reason) => (
            <div key={reason.title}>
              <reason.icon className="w-6 h-6 text-accent" strokeWidth={1.5} />
              <h3 className="mt-5 text-lg font-light text-foreground">{reason.title}</h3>
              <p className="mt-3 text-sm leading-relaxed text-muted-foreground">{reason.body}</p>
            </div>
          ))}
        </div>

        <div className="mt-16 border-t border-border pt-12 flex flex-col md:flex-row md:items-center md:justify-between gap-6">
          <p className="text-xl md:text-2xl font-light text-foreground max-w-xl">
            با یک خرید شروع کنید؛ برای پر کردنِ تمام کشوی لباس‌هایتان برمی‌گردید
          </p>
        </div>
      </div>
    </section>
  );
}
