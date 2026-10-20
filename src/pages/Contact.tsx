import { useState } from "react";
import { useToast } from "@/hooks/use-toast";
import { supabase } from "@/integrations/supabase/client";
import SEO from "@/components/SEO";

export default function Contact() {
  const { toast } = useToast();
  const [form, setForm] = useState({ firstName: "", lastName: "", email: "", subject: "", message: "" });
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsSubmitting(true);
    
    const { error } = await supabase.from('tickets').insert({
      first_name: form.firstName,
      last_name: form.lastName,
      email: form.email || null,
      subject: form.subject,
      message: form.message
    });

    if (error) {
      console.error(error);
      toast({
        title: "خطا در ارسال پیام",
        description: "متاسفانه مشکلی رخ داد. لطفاً دوباره تلاش کنید.",
        variant: "destructive"
      });
    } else {
      toast({
        title: "پیام شما ارسال شد!",
        description: "از پیام شما سپاسگزاریم. همکاران ما در کمتر از ۲۴ ساعت آینده با شما تماس خواهند گرفت.",
      });
      setForm({ firstName: "", lastName: "", email: "", subject: "", message: "" });
    }
    
    setIsSubmitting(false);
  };

  const update = (field: string) => (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
    setForm(prev => ({ ...prev, [field]: e.target.value }));

  // کلاس‌های استایل
  const labelClass = "block text-sm text-foreground mb-1 font-medium";
  const requiredClass = "text-accent text-xs mr-1"; // تبدیل ml به mr برای راست‌چین
  const inputClass = "w-full px-0 py-2 border-0 border-b border-border bg-transparent text-foreground text-sm focus:outline-hidden focus:border-foreground transition-colors";

  return (
    <>
      <SEO
        title="ارتباط با ما"
        description="با تیم پشتیبانی جامی مد در ارتباط باشید."
      />
      {/* اضافه کردن راست‌چین به کل صفحه */}
      <section className="max-w-6xl mx-auto px-6 py-24 text-right">
        <div className="grid grid-cols-1 md:grid-cols-[1fr_1.2fr] gap-16 items-start">
          
          {/* Left — Info */}
          <div>
            <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-8 leading-tight md:leading-none">
              با ما در تماس باشید.
            </h1>
            <p className="text-base md:text-lg leading-relaxed text-muted-foreground mb-10 md:leading-7">
              خوشحال می‌شویم صدای شما را بشنویم! چه سوالی درباره محصولات ما داشته باشید، چه برای پیگیری سفارش خود به کمک نیاز داشته باشید و چه بخواهید درباره شرایط فروش عمده صحبت کنید. تیم پشتیبانی جامی مد معمولاً در یک روز کاری پاسخگوی شما خواهد بود.
            </p>
            <div className="space-y-3">
              <p className="text-lg text-foreground font-medium">
                <a>mohammad.jamali.mj1385@gmail.com</a>
              </p>
              {/* چپ‌چین کردن شماره تلفن برای نمایش درست اعداد */}
              <p className="text-lg text-foreground font-medium" dir="ltr" style={{ textAlign: "right" }}>
                  0914 458 2859
                  <br />
                  0914 314 0040
                
              </p>
            </div>
          </div>

          {/* Right — Form */}
          <form onSubmit={handleSubmit} className="space-y-6">
            <p className="text-lg font-semibold text-foreground mb-6">فرم تماس</p>
            
            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div>
                <label htmlFor="firstName" className={labelClass}>
                  نام <span className={requiredClass}>(الزامی)</span>
                </label>
                <input id="firstName" required value={form.firstName} onChange={update("firstName")} className={inputClass} />
              </div>
              <div>
                <label htmlFor="lastName" className={labelClass}>
                  نام خانوادگی <span className={requiredClass}>(الزامی)</span>
                </label>
                <input id="lastName" required value={form.lastName} onChange={update("lastName")} className={inputClass} />
              </div>
            </div>
            
            <div>
              <label htmlFor="email" className={labelClass}>
                ایمیل <span className="text-muted-foreground text-xs mr-1">(اختیاری)</span>
              </label>
              {/* input ایمیل رو چپ‌چین کردیم تا انگلیسی راحت تایپ بشه */}
              <input id="email" type="email" value={form.email} onChange={update("email")} className={inputClass} dir="ltr" />
            </div>
            
            <div>
              <label htmlFor="subject" className={labelClass}>
                موضوع <span className={requiredClass}>(الزامی)</span>
              </label>
              <input id="subject" required value={form.subject} onChange={update("subject")} className={inputClass} />
            </div>
            
            <div>
              <label htmlFor="message" className={labelClass}>
                پیام شما <span className={requiredClass}>(الزامی)</span>
              </label>
              <textarea id="message" required value={form.message} onChange={update("message")} className={`${inputClass} h-28 resize-vertical`} />
            </div>
            
            <button
              type="submit"
              disabled={isSubmitting}
              className="px-8 py-3 bg-accent text-accent-foreground text-sm font-medium hover:opacity-90 transition-opacity disabled:opacity-50 disabled:cursor-not-allowed rounded-md"
            >
              {isSubmitting ? "در حال ارسال..." : "ارسال پیام"}
            </button>
          </form>
          
        </div>
      </section>
    </>
  );
}