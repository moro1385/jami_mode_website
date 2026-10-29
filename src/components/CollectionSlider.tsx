import {supabaseAssetUrl} from '@/lib/supabaseRelay';
import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import useEmblaCarousel from "embla-carousel-react";
import { ChevronLeft, ChevronRight } from "lucide-react";
import { collections } from "@/data/collections";
import { cn } from "@/lib/utils";
import { useDepartmentDialog } from "@/hooks/useDepartmentDialog";

const AUTOPLAY_MS = 5000;

export default function CollectionSlider() {
  const [emblaRef, emblaApi] = useEmblaCarousel({ loop: true, direction: "rtl" });
  const [selected, setSelected] = useState(0);
  const { openDialogFor, departmentDialog } = useDepartmentDialog();

  const onSelect = useCallback(() => {
    if (emblaApi) setSelected(emblaApi.selectedScrollSnap());
  }, [emblaApi]);

  useEffect(() => {
    if (!emblaApi) return;
    onSelect();
    emblaApi.on("select", onSelect);
    return () => {
      emblaApi.off("select", onSelect);
    };
  }, [emblaApi, onSelect]);

  useEffect(() => {
    if (!emblaApi) return;
    const id = window.setInterval(() => emblaApi.scrollNext(), AUTOPLAY_MS);
    return () => window.clearInterval(id);
  }, [emblaApi]);

  const handleCtaClick = (e: React.MouseEvent, handle: string, name: string) => {
    e.preventDefault();
    openDialogFor(handle, name);
  };

  return (
    <>
      <section className="relative w-full -mt-[88px] md:-mt-[104px]" aria-label="Collections">
        <div className="overflow-hidden" ref={emblaRef}>
          <div className="flex">
            {collections.map((collection, index) => (
              <div key={collection.handle} className="relative flex-[0_0_100%] min-w-0">
                <div className="relative h-[80vh] min-h-[520px] w-full">
                  <img
                    src={supabaseAssetUrl(collection.image)}
                    alt={collection.name}
                    width={1920}
                    height={1080}
                    loading={index === 0 ? "eager" : "lazy"}
                    {...{fetchpriority:index === 0 ? "high" : "low"}}
                    decoding="async"
                    className="w-full h-full object-cover"
                  />
                  <div className="absolute inset-0 bg-[hsl(30_30%_18%/0.42)]" />
                  <div className="absolute inset-0 flex items-end">
                    <div className="max-w-7xl mx-auto w-full px-6 pb-20 md:pb-24">
                      <p className="text-xl md:text-2xl text-primary-foreground/80 mb-4">
                        {collection.eyebrow}
                      </p>
                      <h2 className="text-5xl md:text-7xl lg:text-8xl font-display font-black text-primary-foreground leading-none lg:leading-none md:leading-none">
                        {collection.name}
                      </h2>
                      <p className="mt-5 max-w-xl text-sm md:text-base text-primary-foreground/85">
                        {collection.tagline}
                      </p>
                      <Link
                        to={`/shop?category=${collection.handle}`}
                        onClick={(e) => handleCtaClick(e, collection.handle, collection.name)}
                        className="inline-block mt-8 px-8 py-3 bg-accent text-accent-foreground text-xs hover:opacity-90 transition-opacity"
                      >
                        خرید {collection.name}
                      </Link>
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>

        <button
          onClick={() => emblaApi?.scrollNext()}
          aria-label="Next collection"
          className="hidden md:flex absolute left-6 top-1/2 -translate-y-1/2 w-11 h-11 items-center justify-center bg-background/20 backdrop-blur-xs text-primary-foreground hover:bg-background/35 transition-colors"
        >
          <ChevronLeft className="w-5 h-5" />
        </button>
        <button
          onClick={() => emblaApi?.scrollPrev()}
          aria-label="Previous collection"
          className="hidden md:flex absolute right-6 top-1/2 -translate-y-1/2 w-11 h-11 items-center justify-center bg-background/20 backdrop-blur-xs text-primary-foreground hover:bg-background/35 transition-colors"
        >
          <ChevronRight className="w-5 h-5" />
        </button>

        <div className="absolute bottom-8 left-0 right-0 flex justify-center gap-2">
          {collections.map((collection, i) => (
            <button
              key={collection.handle}
              onClick={() => emblaApi?.scrollTo(i)}
              aria-label={`Go to ${collection.name}`}
              className={cn(
                "h-[3px] transition-all duration-300",
                i === selected ? "w-10 bg-accent" : "w-5 bg-primary-foreground/50"
              )}
            />
          ))}
        </div>
      </section>

      {departmentDialog}
    </>
  );
}
