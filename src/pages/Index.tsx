import CollectionSlider from "@/components/CollectionSlider";
import CategoryQuickNav from "@/components/CategoryQuickNav";
import CollectionCardsRow from "@/components/CollectionCardsRow";
import ProductRail from "@/components/ProductRail";
import WhyJamiMode from "@/components/WhyJamiMode";
import FadeIn from "@/components/FadeIn";
import SEO from "@/components/SEO";

export default function Index() {
  return (
    <>
      <SEO
        title="فروشگاه اینترنتی جوراب، لباس زیر و لباس راحتی"
        description="فروشگاه اینترنتی جوراب، لباس زیر، زیرپوش و لباس راحتی — ارسال سریع و کیفیت مطمئن."
      />
      <CollectionSlider />

      <FadeIn>
        <CategoryQuickNav />
      </FadeIn>

      <FadeIn>
        <ProductRail
          type="newest"
          eyebrow="تازه ترین ها"
          title="جدید ترین محصولات"
          count={12}
          className="py-20 bg-background"
        />
      </FadeIn>

      <FadeIn>
        <CollectionCardsRow />
      </FadeIn>

      <FadeIn>
        <ProductRail
          type="featured"
          eyebrow="محبوب ها"
          title="محصولات ویژه و خاص"
          count={12}
          className="py-20 bg-background"
        />
      </FadeIn>

      <FadeIn>
        <WhyJamiMode />
      </FadeIn>
    </>
  );
}
