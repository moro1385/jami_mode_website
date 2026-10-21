import { Link } from 'react-router-dom';

export default function ReturnPolicy() {
  return (
    <article className="max-w-3xl mx-auto px-6 pt-8 pb-32 text-right" dir="rtl">
      <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-16 leading-tight md:leading-none">
        شرایط مرجوعی و بازگشت کالا
      </h1>

      <div className="space-y-6 text-base md:text-lg leading-relaxed text-muted-foreground mb-16 md:leading-7">
        <p>
          رضایت مندی مشتریان همواره از اولویت‏‌های جامی مد بوده است و در این راستا می‏‌کوشیم تا هر سفارش در شرایط مطلوب و مورد انتظار به دست مشتری برسد.
        </p>
        <p>
          با وجود این ممکن است مشتریان محترم پس از خرید، با مسایلی روبرو شوند که در چنین مواردی خدماتی در چارچوب خدمات پس از فروش در نظر گرفته شده است. شما می‌توانید تا 48 ساعت پس از دریافت کالا، در صورت عدم استفاده و حفظ شرایط اولیه، آن را مرجوع کنید.
        </p>
        <p>
          لطفاً توجه داشته باشید که لباس‌های زیر و اقلام بهداشتی به دلیل مسائل بهداشتی قابلیت تعویض و مرجوعی ندارند.
        </p>
      </div>

      <h2 className="text-2xl md:text-3xl font-bold text-foreground mt-12 mb-6">
        نحوه ثبت درخواست مرجوعی
      </h2>

      <div className="space-y-6 text-base md:text-lg leading-relaxed text-muted-foreground md:leading-7">
        <p>
          در صورتی که محصول شما مشمول شرایط مرجوعی باشد، می‌توانید درخواست خود را از یکی از روش‌های زیر ثبت کنید:
        </p>

        <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">
          ۱. تماس با پشتیبانی
        </h3>
        <p>
          می‌توانید با بخش پشتیبانی Jami Mode تماس بگیرید و پس از هماهنگی با کارشناسان، درخواست مرجوعی خود را ثبت کنید.
        </p>

        <h3 className="text-xl font-semibold text-foreground mt-8 mb-4">
          ۲. ثبت درخواست آنلاین
        </h3>
        <p>
          همچنین می‌توانید از طریق بخش «<Link to="/account/returns/new" className="font-bold underline text-primary hover:text-primary/80">درخواست مرجوعی کالا</Link>» در حساب کاربری خود داخل سایت، درخواست خود را به‌صورت آنلاین ثبت کنید. در این بخش می‌توانید:
        </p>
        <ul className="list-disc pr-6 space-y-2 mt-4">
          <li>شماره سفارش را وارد کنید.</li>
          <li>محصول موردنظر برای مرجوعی را انتخاب کنید.</li>
          <li>دلیل مرجوعی را توضیح دهید.</li>
          <li>در صورت نیاز، عکس محصول را بارگذاری کنید.</li>
          <li>توضیحات تکمیلی خود را وارد کنید.</li>
          <li>درخواست را به‌ پشتیبانی ارسال کنید.</li>
        </ul>

        <p className="mt-8">
          پس از ثبت درخواست، کارشناسان Jami Mode درخواست را بررسی کرده و نتیجه و مراحل بعدی را از طریق سیستم تیکت یا راه‌های ارتباطی ثبت‌شده به شما اطلاع خواهند داد.
        </p>
      </div>
    </article>
  );
}
