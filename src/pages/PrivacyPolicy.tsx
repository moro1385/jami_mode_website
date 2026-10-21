export default function PrivacyPolicy() {
  return (
    <article className="max-w-3xl mx-auto px-6 pt-8 pb-32 text-right" dir="rtl">
      <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-16 leading-tight md:leading-none">
        حریم خصوصی کاربران در جامی مد
      </h1>

      <div className="space-y-10 text-base md:text-lg leading-relaxed text-muted-foreground mb-16 md:leading-7">

        {/* Section 1 */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-foreground">۱. حفاظت از داده‌های شما</h2>
          <p>
            فروشگاه جامی مد به حریم خصوصی کاربران خود احترام می‌گذارد. اطلاعات شخصی شما (از جمله نام، آدرس و شماره موبایل) به عنوان امانت نزد ما نگهداری شده و تحت هیچ شرایطی در اختیار اشخاص، برندها یا سازمان‌های ثالث قرار نخواهد گرفت.
          </p>
        </section>

        {/* Section 2 */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-foreground">۲. موارد استفاده از اطلاعات</h2>
          <p>شماره تماس و اطلاعات وارد شده در سایت، صرفاً جهت اهداف زیر استفاده می‌شود:</p>
          <ul className="list-disc pr-6 space-y-2">
            <li>احراز هویت و ارسال کد یک‌بار مصرف (OTP) برای ورود امن به حساب کاربری.</li>
            <li>ارسال پیامک‌های اطلاع‌رسانی مربوط به وضعیت پردازش و ارسال سفارش.</li>
            <li>هماهنگی‌های لازم جهت تحویل دقیق مرسوله پستی.</li>
          </ul>
        </section>

        {/* Section 3 */}
        <section className="space-y-4">
          <h2 className="text-2xl font-bold text-foreground">۳. امنیت تراکنش‌های مالی</h2>
          <p>
            تمامی پرداخت‌های شما در جامی مد از طریق اتصال مستقیم به درگاه‌های امن و رسمی بانکی کشور (تحت نظارت شبکه شتاب) انجام می‌پذیرد. پلتفرم ما هیچ‌گونه دسترسی به اطلاعات کارت بانکی شما (مانند رمز دوم، CVV2 و...) نداشته و هیچ داده‌ی مالی‌ای در سرورهای ما ذخیره نمی‌شود. امنیت پرداخت شما صددرصد تضمین‌شده است.
          </p>
        </section>
      </div>
    </article>
  );
}
