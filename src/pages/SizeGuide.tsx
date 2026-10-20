import React from 'react';

export default function SizeGuide() {
  return (
    <article className="max-w-4xl mx-auto px-6 pt-8 pb-32 text-right" dir="rtl">
      <h1 className="text-4xl md:text-5xl font-bold text-foreground mb-16 leading-tight md:leading-none">
        راهنمای سایز
      </h1>

      <div className="space-y-16">
        {/* Section 1: راهنمای انتخاب سایز جوراب */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold mb-2">راهنمای انتخاب سایز جوراب</h2>
            <p className="text-muted-foreground text-base">
              برای انتخاب جوراب، ملاک اصلی سایز کفش است. در این بخش سایزهای بزرگ‌پا نیز اضافه شده است.
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm text-right">
              <thead className="bg-muted/50 border-b border-border text-foreground">
                <tr>
                  <th className="px-6 py-4 font-medium">دسته‌بندی</th>
                  <th className="px-6 py-4 font-medium">سایز کفش (EU)</th>
                  <th className="px-6 py-4 font-medium">سایز پیشنهادی جوراب</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-muted-foreground">
                <tr>
                  <td className="px-6 py-4">مردانه (استاندارد)</td>
                  <td className="px-6 py-4">۴۰ تا ۴۴</td>
                  <td className="px-6 py-4">فری‌سایز (Free Size) یا L/XL</td>
                </tr>
                <tr>
                  <td className="px-6 py-4">مردانه (بزرگ‌پا)</td>
                  <td className="px-6 py-4">۴۵ تا ۴۸</td>
                  <td className="px-6 py-4">2XL / 3XL</td>
                </tr>
                <tr>
                  <td className="px-6 py-4">زنانه</td>
                  <td className="px-6 py-4">۳۶ تا ۴۰</td>
                  <td className="px-6 py-4">فری‌سایز (Free Size) یا S/M</td>
                </tr>
                <tr>
                  <td className="px-6 py-4">بچه‌گانه (کودک)</td>
                  <td className="px-6 py-4">۲۵ تا ۳۰</td>
                  <td className="px-6 py-4">مناسب سن ۴ تا ۷ سال</td>
                </tr>
                <tr>
                  <td className="px-6 py-4">بچه‌گانه (نوجوان)</td>
                  <td className="px-6 py-4">۳۱ تا ۳۵</td>
                  <td className="px-6 py-4">مناسب سن ۸ تا ۱۲ سال</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 2: راهنمای سایز لباس زیر */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold mb-2">راهنمای سایز لباس زیر (شورت و زیرپوش)</h2>
            <p className="text-muted-foreground text-base">
              برای لباس‌های زیر مردانه و زنانه، اندازه دور کمر و دور سینه اهمیت بالایی دارد. این لباس‌ها معمولاً پارچه‌های کشسان دارند و باید به درستی روی بدن قرار بگیرند.
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm text-right">
              <thead className="bg-muted/50 border-b border-border text-foreground">
                <tr>
                  <th className="px-6 py-4 font-medium">سایز استاندارد</th>
                  <th className="px-6 py-4 font-medium">دور کمر (سانتی‌متر)</th>
                  <th className="px-6 py-4 font-medium">دور سینه (سانتی‌متر)</th>
                  <th className="px-6 py-4 font-medium">رده سنی/جنسیت</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-muted-foreground">
                <tr>
                  <td className="px-6 py-4">S (اسمال)</td>
                  <td className="px-6 py-4">۷۰ - ۷۶</td>
                  <td className="px-6 py-4">۸۶ - ۹۱</td>
                  <td className="px-6 py-4">مردانه / زنانه</td>
                </tr>
                <tr>
                  <td className="px-6 py-4">M (مدیوم)</td>
                  <td className="px-6 py-4">۷۷ - ۸۴</td>
                  <td className="px-6 py-4">۹۲ - ۹۹</td>
                  <td className="px-6 py-4">مردانه / زنانه</td>
                </tr>
                <tr>
                  <td className="px-6 py-4">L (لارج)</td>
                  <td className="px-6 py-4">۸۵ - ۹۲</td>
                  <td className="px-6 py-4">۱۰۰ - ۱۰۷</td>
                  <td className="px-6 py-4">مردانه / زنانه</td>
                </tr>
                <tr>
                  <td className="px-6 py-4">XL (ایکس‌لارج)</td>
                  <td className="px-6 py-4">۹۳ - ۱۰۰</td>
                  <td className="px-6 py-4">۱۰۸ - ۱۱۵</td>
                  <td className="px-6 py-4">مردانه / زنانه</td>
                </tr>
                <tr>
                  <td className="px-6 py-4">2XL (دو ایکس‌لارج)</td>
                  <td className="px-6 py-4">۱۰۱ - ۱۰۹</td>
                  <td className="px-6 py-4">۱۱۶ - ۱۲۳</td>
                  <td className="px-6 py-4">مردانه / زنانه</td>
                </tr>
                <tr>
                  <td className="px-6 py-4">3XL (سه ایکس‌لارج)</td>
                  <td className="px-6 py-4">۱۱۰ - ۱۱۸</td>
                  <td className="px-6 py-4">۱۲۴ - ۱۳۲</td>
                  <td className="px-6 py-4">مردانه / زنانه</td>
                </tr>
                <tr>
                  <td className="px-6 py-4">بچه‌گانه (S - L)</td>
                  <td className="px-6 py-4">۵۰ - ۶۵</td>
                  <td className="px-6 py-4">۵۵ - ۷۵</td>
                  <td className="px-6 py-4">۵ تا ۱۲ سال</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 3: راهنمای سایز لباس‌های راحتی و ورزشی */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold mb-2">راهنمای سایز لباس‌های راحتی و ورزشی</h2>
            <p className="text-muted-foreground text-base">
              این جدول مختص تیشرت، تاپ، شلوار و شلوارک‌های راحتی است. برای شلوارک و شلوار، علاوه بر دور کمر، اندازه دور باسن نیز تعیین‌کننده است. برای لباس‌های راحتی معمولاً پیشنهاد می‌شود سایزی را انتخاب کنید که کمی آزادتر باشد.
            </p>
          </div>
          <div className="overflow-x-auto rounded-xl border border-border">
            <table className="w-full text-sm text-right">
              <thead className="bg-muted/50 border-b border-border text-foreground">
                <tr>
                  <th className="px-6 py-4 font-medium">سایز</th>
                  <th className="px-6 py-4 font-medium">دور سینه (تیشرت/تاپ)</th>
                  <th className="px-6 py-4 font-medium">دور کمر (شلوار/شلوارک)</th>
                  <th className="px-6 py-4 font-medium">دور باسن (شلوار/شلوارک)</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border text-muted-foreground">
                <tr>
                  <td className="px-6 py-4">S</td>
                  <td className="px-6 py-4">۸۸ - ۹۴</td>
                  <td className="px-6 py-4">۷۲ - ۷۹</td>
                  <td className="px-6 py-4">۸۸ - ۹۵</td>
                </tr>
                <tr>
                  <td className="px-6 py-4">M</td>
                  <td className="px-6 py-4">۹۵ - ۱۰۱</td>
                  <td className="px-6 py-4">۸۰ - ۸۷</td>
                  <td className="px-6 py-4">۹۶ - ۱۰۳</td>
                </tr>
                <tr>
                  <td className="px-6 py-4">L</td>
                  <td className="px-6 py-4">۱۰۲ - ۱۰۸</td>
                  <td className="px-6 py-4">۸۸ - ۹۵</td>
                  <td className="px-6 py-4">۱۰۴ - ۱۱۱</td>
                </tr>
                <tr>
                  <td className="px-6 py-4">XL</td>
                  <td className="px-6 py-4">۱۰۹ - ۱۱۵</td>
                  <td className="px-6 py-4">۹۶ - ۱۰۴</td>
                  <td className="px-6 py-4">۱۱۲ - ۱۱۹</td>
                </tr>
                <tr>
                  <td className="px-6 py-4">2XL</td>
                  <td className="px-6 py-4">۱۱۶ - ۱۲۳</td>
                  <td className="px-6 py-4">۱۰۵ - ۱۱۴</td>
                  <td className="px-6 py-4">۱۲۰ - ۱۲۸</td>
                </tr>
                <tr>
                  <td className="px-6 py-4">3XL</td>
                  <td className="px-6 py-4">۱۲۴ - ۱۳۲</td>
                  <td className="px-6 py-4">۱۱۵ - ۱۲۵</td>
                  <td className="px-6 py-4">۱۲۹ - ۱۳۸</td>
                </tr>
              </tbody>
            </table>
          </div>
        </section>

        {/* Section 4: راهنمای اندازه‌گیری دقیق در منزل */}
        <section className="space-y-6">
          <div>
            <h2 className="text-2xl font-semibold mb-2">راهنمای اندازه‌گیری دقیق در منزل</h2>
            <p className="text-muted-foreground text-base">
              برای اینکه بتوانید دقیق‌ترین سایز را انتخاب کنید، این راهنما را مطالعه نمایید:
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="bg-muted/30 border border-border p-5 rounded-xl">
              <h3 className="font-semibold text-foreground mb-2 text-lg">دور سینه</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                برجسته‌ترین قسمت سینه را با متر خیاطی اندازه بگیرید. دقت کنید که متر در پشت کمر افتادگی نداشته باشد و کاملاً موازی با زمین باشد.
              </p>
            </div>

            <div className="bg-muted/30 border border-border p-5 rounded-xl">
              <h3 className="font-semibold text-foreground mb-2 text-lg">دور کمر</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                باریک‌ترین قسمت میان‌تنه (معمولاً کمی بالاتر از ناف) را پیدا کرده و متر را دور آن بپیچید. هنگام اندازه‌گیری، نفس خود را به صورت طبیعی نگه دارید.
              </p>
            </div>

            <div className="bg-muted/30 border border-border p-5 rounded-xl">
              <h3 className="font-semibold text-foreground mb-2 text-lg">دور باسن</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                در حالی که پاهای خود را جفت کرده‌اید بایستید، متر را دور برجسته‌ترین قسمت باسن بپیچید و مطمئن شوید که متر در تمام طول مسیر افقی است.
              </p>
            </div>

            <div className="bg-muted/30 border border-border p-5 rounded-xl">
              <h3 className="font-semibold text-foreground mb-2 text-lg">اندازه‌گیری از روی لباس</h3>
              <p className="text-muted-foreground text-sm leading-relaxed">
                اگر اندازه‌گیری بدن سخت است، یکی از لباس‌های فعلی خود را که در آن احساس راحتی می‌کنید، روی سطحی کاملاً صاف پهن کنید، عرض آن را با متر اندازه بگیرید و عدد به دست آمده را دو برابر کنید تا با جداول بالا مقایسه شود.
              </p>
            </div>
          </div>
        </section>
      </div>
    </article>
  );
}
