import { Link, useLocation, useNavigate } from "react-router-dom";
import {  ShoppingCart, Menu, X, Instagram, User, ChevronDown , Search, Mail } from "lucide-react";
import { useCartStore } from "@/stores/cartStore";
import { useAuthStore } from "@/stores/authStore";
import { supabase } from "@/integrations/supabase/client";
import { useState, useEffect } from "react";
import { cn } from "@/lib/utils";

const shopDepartments = [
  {
    name: "Men",
    label: "مردانه",
    categories: [
      { name: "Socks", label: "جوراب" },
      { name: "Pants", label: "شلوار" },
      { name: "Shorts", label: "شلوارک" },
      { name: "T-Shirts", label: "تیشرت" },
      { name: "Tank Tops", label: "تاپ" },
      { name: "Underwear", label: "لباس زیر" },
      { name: "Undershirts", label: "زیرپوش" },
      { name: "Swimwear", label: "مایو شنا" },
      { name: "Sets", label: "ست" },
    ],
  },
  {
    name: "Women",
    label: "زنانه",
    categories: [
      { name: "Socks", label: "جوراب" },
      { name: "Pants", label: "شلوار" },
      { name: "Shorts", label: "شلوارک" },
      { name: "T-Shirts", label: "تیشرت" },
      { name: "Tank Tops", label: "تاپ" },
      { name: "Underwear", label: "لباس زیر" },
      { name: "Undershirts", label: "زیرپوش" },
      { name: "Sets", label: "ست" },
    ],
  },
  {
    name: "Kids",
    label: "بچه گانه",
    categories: [
      { name: "Socks", label: "جوراب" },
      { name: "Underwear", label: "لباس زیر" },
      { name: "Undershirts", label: "زیر پوش" },
    ],
  },
];

const navLinks = [
  { to: "/", label: "Home" },
  { to: "/about", label: "About" },
  { to: "/contact", label: "Contact" },
];

export default function Header() {
  const totalItems = useCartStore(state =>
    state.items.reduce((sum, i) => sum + i.quantity, 0)
  );
  const session = useAuthStore(state => state.session);
  const isAuthenticated = !!session && session.expiresAt > Date.now();
  const accountHref = isAuthenticated ? "/account" : "/signin";
  const accountLabel = isAuthenticated ? "حساب کاربری" : "ورود";
  const { pathname } = useLocation();
  const [mobileOpen, setMobileOpen] = useState(false);
  const [scrolled, setScrolled] = useState(false);
  const [shopMenuOpen, setShopMenuOpen] = useState(false);
  const [mobileShopMenuOpen, setMobileShopMenuOpen] = useState(false);
  const [unreadMessageCount, setUnreadMessageCount] = useState(0);

  const navigate = useNavigate();
  const [searchQuery, setSearchQuery] = useState("");

  useEffect(() => {
    async function fetchUnreadCount() {
      if (!isAuthenticated || !session?.userId) return;
      try {
        const { count, error } = await supabase
          .from("user_messages")
          .select("*", { count: "exact", head: true })
          .eq("user_id", session.userId)
          .eq("is_read", false);

        if (!error && count !== null) {
          setUnreadMessageCount(count);
        }
      } catch (err) {
        console.error("Failed to fetch unread message count:", err);
      }
    }

    fetchUnreadCount();
    const interval = setInterval(fetchUnreadCount, 60000);
    return () => clearInterval(interval);
  }, [isAuthenticated, session?.userId]);

  const handleSearchSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchQuery.trim()) {
      navigate(`/shop?query=${encodeURIComponent(searchQuery.trim())}`);
      setSearchQuery("");
      setMobileOpen(false);
    }
  };

  const isHome = pathname === "/";

  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 60);
    window.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  const transparent = isHome && !scrolled && !mobileOpen;

  return (
    <header
      className={cn(
        "fixed top-0 left-0 right-0 z-50 transition-all duration-300",
        transparent
          ? "bg-transparent border-b border-transparent"
          : "bg-white border-b border-border shadow-xs"
      )}
    >
<div className="flex items-center justify-between px-6 h-[88px] md:h-[104px] max-w-7xl mx-auto">
        <Link
          to="/"
          className="flex items-center gap-2 md:gap-3"
        >
          {/* عکس لوگو */}
          <img 
            src="/favicon.png" 
            alt="لوگو جامی مد" 
            className="w-8 h-8 md:w-12 md:h-12 object-contain"
            loading="lazy"
            width={48}
            height={48}
          />
          
          {/* نوشته جامی مد (با حفظ استایل‌های قبلی) */}
          <span 
            className={cn(
              "text-xl md:text-4xl font-light uppercase tracking-[0.28em] transition-colors leading-none mt-1 md:leading-10",
              transparent ? "text-primary-foreground" : "text-foreground"
            )}
          >
            Jami<span className="font-medium text-accent">Mode</span>
          </span>
        </Link>
        {/* Desktop nav */}
        <nav className="hidden md:flex items-center gap-8">
          <Link
            to="/"
            className={cn(
                "text-sm transition-colors",
              transparent
                ? "text-primary-foreground/80 hover:text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
              pathname === "/" && (transparent ? "text-primary-foreground font-medium" : "text-foreground font-medium")
            )}
          >
            خانه
          </Link>

          <div
            className="relative"
            onMouseEnter={() => setShopMenuOpen(true)}
            onMouseLeave={() => setShopMenuOpen(false)}
          >
            <button
              onClick={(e) => e.preventDefault()}
              className={cn(
                "text-sm transition-colors flex items-center gap-1 py-4",
                transparent
                  ? "text-primary-foreground/80 hover:text-primary-foreground"
                  : "text-muted-foreground hover:text-foreground",
                pathname.startsWith("/shop") && (transparent ? "text-primary-foreground font-medium" : "text-foreground font-medium")
              )}
            >
              محصولات
              <ChevronDown className="w-4 h-4" />
            </button>

            {/* Desktop Mega Menu */}
            {shopMenuOpen && (
              <div className="absolute top-full right-1/2 translate-x-1/2 bg-background border border-border shadow-lg p-6 w-[600px] flex gap-8 z-50 rounded-2xl overflow-hidden">
                {shopDepartments.map((dept) => (
                  <div key={dept.name} className="flex-1">
                    <h3 className="font-medium text-foreground mb-4 border-b border-border pb-2 text-sm flex items-center gap-2">
                      <span>{dept.label}</span>
                    </h3>
                    <ul className="space-y-2">
                      {dept.categories.map((cat) => (
                        <li key={cat.name}>
                          <Link
                            to={`/shop?department=${dept.name.toLowerCase()}&category=${cat.name.toLowerCase().replace(/\s+/g, '-')}`}
                            className="text-sm text-muted-foreground hover:text-foreground transition-colors block py-1"
                            onClick={() => setShopMenuOpen(false)}
                          >
                            {cat.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Link
            to="/about"
            className={cn(
              "text-sm transition-colors",
              transparent
                ? "text-primary-foreground/80 hover:text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
              pathname === "/about" && (transparent ? "text-primary-foreground font-medium" : "text-foreground font-medium")
            )}
          >
            درباره ما
          </Link>

          <Link
            to="/contact"
            className={cn(
              "text-sm transition-colors",
              transparent
                ? "text-primary-foreground/80 hover:text-primary-foreground"
                : "text-muted-foreground hover:text-foreground",
              pathname === "/contact" && (transparent ? "text-primary-foreground font-medium" : "text-foreground font-medium")
            )}
          >
            ارتباط با ما
          </Link>
        </nav>

        <div className="hidden md:flex items-center gap-5">

          <form onSubmit={handleSearchSubmit} className="relative flex items-center">
            <input
              type="text"
              placeholder="جستجو..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className={cn(
                "w-48 px-3 py-1.5 text-sm bg-transparent border-b outline-hidden transition-colors",
                transparent
                  ? "border-primary-foreground/30 text-primary-foreground placeholder:text-primary-foreground/50 focus:border-primary-foreground"
                  : "border-border text-foreground placeholder:text-muted-foreground focus:border-foreground"
              )}
            />
            <button type="submit" aria-label="Search" className="absolute left-0 top-1/2 -translate-y-1/2">
              <Search className={cn("w-4 h-4", transparent ? "text-primary-foreground/80 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground")} />
            </button>
          </form>
          <a href="https://www.instagram.com/jami_modee?igsi=Z2N2cXdwNWZpeDRw&utm_source=qr" target="_blank" rel="noopener noreferrer" aria-label="Instagram">
            <Instagram className={cn("w-[18px] h-[18px] transition-colors", transparent ? "text-primary-foreground/80 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground")} />
          </a>
          <Link to={accountHref} aria-label={accountLabel}>
            <User className={cn("w-[18px] h-[18px] transition-colors", transparent ? "text-primary-foreground/80 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground")} />
          </Link>
          {isAuthenticated && (
            <Link to="/account/messages" className="relative" aria-label="Messages">
              <Mail className={cn("w-[18px] h-[18px] transition-colors", transparent ? "text-primary-foreground/80 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground")} />
              {unreadMessageCount > 0 && (
                <span className="absolute -top-2 -left-2 bg-accent text-accent-foreground text-[10px] w-[18px] h-[18px] rounded-full flex items-center justify-center font-medium">
                  {unreadMessageCount}
                </span>
              )}
            </Link>
          )}
          <Link to="/cart" className="relative" aria-label="Shopping cart">
            <ShoppingCart className={cn("w-[18px] h-[18px] transition-colors", transparent ? "text-primary-foreground/80 hover:text-primary-foreground" : "text-muted-foreground hover:text-foreground")} />
            {totalItems > 0 && (
              <span className="absolute -top-2 -left-2 bg-accent text-accent-foreground text-[10px] w-[18px] h-[18px] rounded-full flex items-center justify-center font-medium">
                {totalItems}
              </span>
            )}
          </Link>
        </div>


        {/* Mobile */}
        <div className="flex md:hidden items-center gap-3">
          <Link to={accountHref} aria-label={accountLabel}>
            <User className={cn("w-5 h-5 transition-colors", transparent ? "text-primary-foreground" : "text-foreground")} />
          </Link>
          {isAuthenticated && (
            <Link to="/account/messages" className="relative" aria-label="Messages">
              <Mail className={cn("w-5 h-5 transition-colors", transparent ? "text-primary-foreground" : "text-foreground")} />
              {unreadMessageCount > 0 && (
                <span className="absolute -top-2 -left-2 bg-accent text-accent-foreground text-[10px] w-[18px] h-[18px] rounded-full flex items-center justify-center font-medium">
                  {unreadMessageCount}
                </span>
              )}
            </Link>
          )}
          <Link to="/cart" className="relative" aria-label="Shopping cart">
            <ShoppingCart className={cn("w-5 h-5 transition-colors", transparent ? "text-primary-foreground" : "text-foreground")} />
            {totalItems > 0 && (
              <span className="absolute -top-2 -left-2 bg-accent text-accent-foreground text-[10px] w-[18px] h-[18px] rounded-full flex items-center justify-center font-medium">
                {totalItems}
              </span>
            )}
          </Link>
          <button onClick={() => setMobileOpen(!mobileOpen)} aria-label="Toggle menu">
            {mobileOpen
              ? <X className={cn("w-6 h-6", transparent ? "text-primary-foreground" : "text-foreground")} />
              : <Menu className={cn("w-6 h-6", transparent ? "text-primary-foreground" : "text-foreground")} />
            }
          </button>
        </div>
      </div>

      {/* Mobile menu */}
      {mobileOpen && (
        <nav className="md:hidden border-t border-border bg-background px-6 py-6 space-y-4 h-[calc(100vh-88px)] overflow-y-auto">
          <form onSubmit={handleSearchSubmit} className="relative flex items-center mb-6">
            <input
              type="text"
              placeholder="جستجو..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full px-3 py-2 text-sm bg-muted border border-border rounded-md text-foreground placeholder:text-muted-foreground outline-hidden focus:border-foreground transition-colors"
            />
            <button type="submit" aria-label="Search" className="absolute left-3 top-1/2 -translate-y-1/2">
              <Search className="w-4 h-4 text-muted-foreground" />
            </button>
          </form>

          <Link
            to="/"
            onClick={() => setMobileOpen(false)}
            className={cn(
              "block text-sm text-muted-foreground",
              pathname === "/" && "text-foreground font-medium"
            )}
          >
            خانه
          </Link>

          <div>
            <div className="flex items-center justify-between">
              <button
                onClick={(e) => {
                  e.preventDefault();
                  setMobileShopMenuOpen(!mobileShopMenuOpen);
                }}
                className={cn(
                  "flex items-center justify-between w-full text-sm text-muted-foreground text-left",
                  pathname.startsWith("/shop") && "text-foreground font-medium"
                )}
              >
                محصولات
                <ChevronDown className={cn("w-5 h-5 transition-transform", mobileShopMenuOpen && "rotate-180")} />
              </button>
            </div>

            {mobileShopMenuOpen && (
              <div className="pl-4 mt-4 space-y-6">
                {shopDepartments.map((dept) => (
                  <div key={dept.name}>
                    <h3 className="font-medium text-foreground mb-3 text-xs flex items-center pr-4">
                      <span>{dept.label}</span>
                    </h3>
                    <ul className="space-y-3">
                      {dept.categories.map((cat) => (
                        <li key={cat.name}>
                          <Link
                            to={`/shop?department=${dept.name.toLowerCase()}&category=${cat.name.toLowerCase().replace(/\s+/g, '-')}`}
                            className="text-sm text-muted-foreground hover:text-foreground block"
                            onClick={() => setMobileOpen(false)}
                          >
                            {cat.label}
                          </Link>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </div>
            )}
          </div>

          <Link
            to="/about"
            onClick={() => setMobileOpen(false)}
            className={cn(
              "block text-sm text-muted-foreground",
              pathname === "/about" && "text-foreground font-medium"
            )}
          >
            درباره ما
          </Link>

          <Link
            to="/contact"
            onClick={() => setMobileOpen(false)}
            className={cn(
              "block text-sm text-muted-foreground",
              pathname === "/contact" && "text-foreground font-medium"
            )}
          >
            ارتباط با ما
          </Link>

          <div className="pt-4 mt-4 border-t border-border">
            <Link
              to={accountHref}
              onClick={() => setMobileOpen(false)}
              className="block text-sm text-muted-foreground"
            >
              {isAuthenticated ? "حساب کاربری" : "ورود"}
            </Link>
          </div>
        </nav>
      )}

    </header>
  );
}
