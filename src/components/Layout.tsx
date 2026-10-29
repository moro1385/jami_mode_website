import { Suspense } from "react";
import PageLoading from "./PageLoading";
import { useAuthStore } from "@/stores/authStore";
import { Outlet } from "react-router-dom";
import { Link } from "react-router-dom";
import Header from "./Header";
import Footer from "./Footer";
import ScrollToTop from "./ScrollToTop";


export default function Layout() {
const user = useAuthStore((s) => s.user);

  return (
    <div className="min-h-screen flex flex-col">
      <ScrollToTop />
      <Header />
      <main className="flex-1 pt-[88px] md:pt-[104px] bg-warm-bg">
        <Suspense fallback={<PageLoading />}><Outlet /></Suspense>
      </main>

      {/* Pre-Footer CTA Banner */}
{!user && (
        <section className="relative w-full py-24 bg-muted overflow-hidden flex items-center justify-center">
          {/* Placeholder background image / overlay */}
          <div className="absolute inset-0 bg-stone-900/80 z-10" />
          <div className="absolute inset-0 bg-[url('https://images.unsplash.com/photo-1490481651871-ab68de25d43d?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center" />

          <div className="relative z-20 text-center px-6 max-w-2xl mx-auto">
            <h2 className="text-4xl md:text-5xl font-light text-white mb-8">
              همین حالا خرید را شروع کنید
            </h2>
            <div className="flex flex-col sm:flex-row gap-4 justify-center items-center">
              <Link
                to="/signin"
                className="px-8 py-3 bg-white text-stone-900 text-sm font-medium hover:bg-stone-100 transition-colors w-full sm:w-auto text-center"
              >
                ورود
              </Link>
              <Link
                to="/signup"
                className="px-8 py-3 border border-white text-white text-sm font-medium hover:bg-white/10 transition-colors w-full sm:w-auto text-center"
              >
                ثبت‌نام
              </Link>
            </div>
          </div>
        </section>
      )}

      <Footer />
    </div>
  );
}
