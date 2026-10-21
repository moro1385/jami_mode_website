import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import SEO from "@/components/SEO";

export default function FAQ() {
  return (
    <article className="max-w-3xl mx-auto px-6 pt-8 pb-32 text-right">
      <SEO
        title="سوالات متداول"
        description="پاسخ سوالات پرتکرار مشتریان جامی مد."
      />
      {/* Headline */}
      <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-16 leading-tight md:leading-none">
        سوالات متداول
      </h1>

      {/* Accordion Content */}
      <div className="space-y-6 text-base md:text-lg leading-relaxed text-muted-foreground mb-24 md:leading-7">
        <Accordion type="single" collapsible className="w-full text-right" dir="rtl">
          <AccordionItem value="item-1">
            <AccordionTrigger className="text-right">چگونه می‌توانم سفارش خود را ثبت کنم؟</AccordionTrigger>
            <AccordionContent className="text-right text-base text-muted-foreground">
              شما می‌توانید با مراجعه به صفحه فروشگاه، محصولات مورد نظر خود را به سبد خرید اضافه کرده و پس از ورود به حساب کاربری، مراحل پرداخت را طی کنید.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-2">
            <AccordionTrigger className="text-right">آیا امکان بازگشت کالا وجود دارد؟</AccordionTrigger>
            <AccordionContent className="text-right text-base text-muted-foreground">
              بله، شما می‌توانید در صورت وجود مشکل در محصول، از طریق پنل کاربری خود درخواست مرجوعی ثبت کنید.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-3">
            <AccordionTrigger className="text-right">هزینه ارسال چگونه محاسبه می‌شود؟</AccordionTrigger>
            <AccordionContent className="text-right text-base text-muted-foreground">
              هزینه ارسال بر اساس وزن و مقصد سفارش شما به صورت خودکار در مرحله پرداخت محاسبه خواهد شد.
            </AccordionContent>
          </AccordionItem>
          <AccordionItem value="item-4">
            <AccordionTrigger className="text-right">آیا فروش عمده هم دارید؟</AccordionTrigger>
            <AccordionContent className="text-right text-base text-muted-foreground">
              بله، برای اطلاع از شرایط فروش عمده می‌توانید با شماره‌های پشتیبانی تماس بگیرید.
            </AccordionContent>
          </AccordionItem>
        </Accordion>
      </div>
    </article>
  );
}
