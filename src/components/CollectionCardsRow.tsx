import {supabaseAssetUrl} from '@/lib/supabaseRelay';
import { Link } from "react-router-dom";
import { collections } from "@/data/collections";
import { getCollectionImage } from "@/data/collectionImages";

// Explode standard collections into department-specific routes as requested
const collectionCards = [
  // مردانه
  { dept: "men", deptLabel: "مردانه", handle: "socks" },
  { dept: "men", deptLabel: "مردانه", handle: "underwear" },
  { dept: "men", deptLabel: "مردانه", handle: "undershirts" },
  { dept: "men", deptLabel: "مردانه", handle: "pants" },
  { dept: "men", deptLabel: "مردانه", handle: "shorts" },
  { dept: "men", deptLabel: "مردانه", handle: "t-shirts" },
  { dept: "men", deptLabel: "مردانه", handle: "tank-tops", labelOverride: "تاپ" },
  { dept: "men", deptLabel: "مردانه", handle: "sets" },
  // زنانه
  { dept: "women", deptLabel: "زنانه", handle: "socks" },
  { dept: "women", deptLabel: "زنانه", handle: "underwear" },
  { dept: "women", deptLabel: "زنانه", handle: "undershirts" },
  { dept: "women", deptLabel: "زنانه", handle: "pants" },
  { dept: "women", deptLabel: "زنانه", handle: "shorts" },
  { dept: "women", deptLabel: "زنانه", handle: "t-shirts" },
  { dept: "women", deptLabel: "زنانه", handle: "tank-tops", labelOverride: "تاپ" },
  { dept: "women", deptLabel: "زنانه", handle: "sets" },
  // بچه گانه
  { dept: "kids", deptLabel: "بچه گانه", handle: "socks" },
  { dept: "kids", deptLabel: "بچه گانه", handle: "underwear" },
  { dept: "kids", deptLabel: "بچه گانه", handle: "undershirts" },
].map((item) => {
  const baseCollection =
    collections.find((c) => c.handle === item.handle) ||
    collections.find((c) => c.handle === (item.handle === "tank-tops" ? "t-shirts" : item.handle));
  return {
    ...item,
    name: item.labelOverride || baseCollection?.name || item.handle,
    image: baseCollection?.image || "",
    gridImage: getCollectionImage(item.dept, item.handle),
    eyebrow: baseCollection?.eyebrow || "نیاز روزمره شما",
  };
});

export default function CollectionCardsRow() {
  return (
    <section className="py-20 bg-[hsl(var(--warm-bg))]">
      <div className="max-w-7xl mx-auto px-6">
        <div className="flex items-end justify-between gap-6 mb-10">
          <div>
            <h2 className="text-3xl md:text-4xl font-light text-foreground">همه کالکشن ها</h2>
          </div>
        </div>

        <div className="flex gap-5 overflow-x-auto snap-x snap-mandatory pb-4 -mx-6 px-6">
          {collectionCards.map((card, idx) => (
            <Link
              key={`${card.dept}-${card.handle}-${idx}`}
              to={`/shop?department=${card.dept}&category=${card.handle}`}
              className="group snap-start shrink-0 w-[70%] sm:w-[45%] lg:w-[24%]"
            >
              <div className="overflow-hidden rounded-2xl">
<img
  src={supabaseAssetUrl(card.gridImage)}
  onError={(e) => {
    if (card.image && e.currentTarget.src !== card.image) {
      e.currentTarget.src = card.image;
    }
  }}
  alt={`${card.deptLabel} ${card.name}`}
  width={1920}
  height={1080}
  loading="lazy"
  decoding="async"
  className="w-full aspect-[3/4] object-cover transition-transform duration-700 group-hover:scale-[1.04]"
/>
              </div>
              <h3 className="mt-4 text-lg font-light text-foreground"> {card.name} {card.deptLabel}</h3>
            </Link>
          ))}
        </div>
      </div>
    </section>
  );
}