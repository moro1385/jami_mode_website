import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { getBrandOptions } from "@/lib/brands";
import { cn } from "@/lib/utils";

const getFilterCategories = (department?: string | null, category?: string | null) => {
  let typeOptions: { value: string; label: string }[] = [];
  let sizeOptions: { value: string; label: string }[] = [
    { value: "S", label: "S" },
    { value: "M", label: "M" },
    { value: "L", label: "L" },
    { value: "XL", label: "XL" },
    { value: "2XL", label: "2XL" },
    { value: "3XL", label: "3XL" },
    { value: "4XL", label: "4XL" },
    { value: "5XL", label: "5XL" },
  ];
  let patternOptions = [
    { value: "رنگی", label: "رنگی" },
    { value: "طرح‌دار", label: "طرح‌دار" },
    { value: "ساده", label: "ساده" },
  ];


  const brandOptions = getBrandOptions(department, category);

  if (category === "underwear") {
    patternOptions = [
      { value: "طرح‌دار", label: "طرح‌دار" },
      { value: "ساده", label: "ساده" },
    ];

    if (department === "men") {
      typeOptions = [
        { value: "شورت اسلیپ", label: "شورت اسلیپ" },
        { value: "شورت نیم پا", label: "شورت نیم پا" },
        { value: "شورت پادار", label: "شورت پادار" },
        { value: "شورت باکسر", label: "شورت باکسر" },
        { value: "شورت اسپورت", label: "شورت اسپورت" },
      ];
    } else if (department === "women") {
      typeOptions = [{ value: "شورت اسلیپ", label: "شورت اسلیپ" }];
    } else if (department === "kids") {
      typeOptions = [
        { value: "اسلیپ", label: "اسلیپ" },
        { value: "پادار", label: "پادار" },
      ];
    }
  } else if (category === "undershirts") {
    if (department === "men") {
      typeOptions = [
        { value: "رکابی", label: "رکابی" },
        { value: "نیم آستین", label: "نیم آستین" },
        { value: "خشتی", label: "خشتی" },
        { value: "حلقه‌ای", label: "حلقه‌ای" },
        { value: "پشت قهرمانی", label: "پشت قهرمانی" },
      ];
    } else if (department === "women") {
      typeOptions = [
        { value: "رکابی", label: "رکابی" },
        { value: "نیم تنه", label: "نیم تنه" },
      ];
    } else if (department === "kids") {
      typeOptions = [
        { value: "زیرپوش", label: "زیرپوش" },
      ];
    }
  } else if (category === "pants") {
    if (department === "men") {
      typeOptions = [
        { value: "شلوار ورزشی", label: "شلوار ورزشی" },
        { value: "شلوار ساده", label: "شلوار ساده" },
        { value: "شلوار اسلش", label: "شلوار اسلش" },
        { value: "شلوار دمپا کش", label: "شلوار دمپا کش" },
        { value: "شلوار آیرو", label: "شلوار آیرو" },
        { value: "شلوار نخی", label: "شلوار نخی" },
      ];
    } else if (department === "women") {
      typeOptions = [
        { value: "شلوار ساده", label: "شلوار ساده" },
        { value: "شلوار ورزشی", label: "شلوار ورزشی" },
        { value: "شلوار نخی", label: "شلوار نخی" },
        { value: "ساق شلواری", label: "ساق شلواری" },
        { value: "شلوار آیرو", label: "شلوار آیرو" },
      ];
    }
  } else if (category === "shorts") {
    if (department === "men") {
      typeOptions = [
        { value: "شلوارک کوتاه", label: "شلوارک کوتاه" },
        { value: "شلوارک بلند", label: "شلوارک بلند" },
        { value: "شلوارک ساده", label: "شلوارک ساده" },
        { value: "شلوارک ورزشی", label: "شلوارک ورزشی" },
      ];
    } else if (department === "women") {
      typeOptions = [
        { value: "شلوارک کوتاه", label: "شلوارک کوتاه" },
        { value: "شلوارک بلند", label: "شلوارک بلند" },
        { value: "شلوارک ساده", label: "شلوارک ساده" },
        { value: "شلوارک ورزشی", label: "شلوارک ورزشی" },
        { value: "شورتک", label: "شورتک" },
      ];
    }
  } else if (category === "t-shirts") {
    if (department === "men" || department === "women") {
      typeOptions = [
        { value: "تیشرت ساده", label: "تیشرت ساده" },
        { value: "تیشرت ورزشی", label: "تیشرت ورزشی" },
        { value: "تیشرت آیرو", label: "تیشرت آیرو" },
        { value: "تیشرت سوزنی", label: "تیشرت سوزنی" },
      ];
    }
  } else if (category === "tank-tops") {
    if (department === "men") {
      typeOptions = [
        { value: "تاپ ساده", label: "تاپ ساده" },
        { value: "تاپ ورزشی", label: "تاپ ورزشی" },
        { value: "تاپ آیکو", label: "تاپ آیکو" },
        { value: "تاپ سوزنی", label: "تاپ سوزنی" },
      ];
    } else if (department === "women") {
      typeOptions = [
        { value: "تاپ ساده", label: "تاپ ساده" },
        { value: "تاپ ورزشی", label: "تاپ ورزشی" },
        { value: "تاپ آیکو", label: "تاپ آیکو" },
        { value: "تاپ سوزنی", label: "تاپ سوزنی" },
        { value: "تاپ راه راه", label: "تاپ راه راه" },
      ];
    }
  } else if (category === "sets") {
    if (department === "men") {
      typeOptions = [
        { value: "ست بلوز و شلوار", label: "ست بلوز و شلوار" },
        { value: "ست تیشرت و شلوار", label: "ست تیشرت و شلوار" },
        { value: "ست تیشرت و شلوارک", label: "ست تیشرت و شلوارک" },
        { value: "ست تاپ و شلوارک", label: "ست تاپ و شلوارک" },
        { value: "ست زیر پوش و شورت", label: "ست زیر پوش و شورت" },
      ];
    } else if (department === "women") {
      typeOptions = [
        { value: "ست بلوز و شلوار", label: "ست بلوز و شلوار" },
        { value: "ست تیشرت و شلوارک", label: "ست تیشرت و شلوارک" },
        { value: "ست تاپ و شلوارک", label: "ست تاپ و شلوارک" },
      ];
    }
  } else if (category === "socks") {
    // Socks
    sizeOptions = [
      { value: "فری سایز", label: "فری سایز" },
    ];

    typeOptions = [
      { value: "جوراب ساقدار", label: "جوراب ساقدار" },
      { value: "جوراب نیم ساق", label: "جوراب نیم ساق" },
      { value: "جوراب مچی", label: "جوراب مچی" },
      { value: "جوراب کالج", label: "جوراب کالج" },
      { value: "جوراب ورزشی", label: "جوراب ورزشی" },
      { value: "جوراب مجلسی", label: "جوراب مجلسی" },
      { value: "جوراب دیابتی", label: "جوراب دیابتی" },
      { value: "جوراب نخی", label: "جوراب نخی" },
      { value: "جوراب نانو", label: "جوراب نانو" },
      { value: "جوراب بامبو گیاهی", label: "جوراب بامبو گیاهی" },
    ];
  }

  return [
    {
      id: "type",
      title: "نوع محصول",
      options: typeOptions,
    },
    {
      id: "brand",
      title: "برند",
      options: brandOptions,
    },
    {
      id: "pattern",
      title: "رنگ/طرح",
      options: patternOptions,
    },
    {
      id: "size",
      title: "سایز",
      options: sizeOptions,
    },
  ].filter(cat => cat.options.length > 0);
};

export type FilterState = Record<string, string[]>;

interface ShopFiltersProps {
  selectedFilters: FilterState;
  onFilterChange: (categoryId: string, value: string, checked: boolean) => void;
  department?: string | null;
  category?: string | null;
  className?: string;
}

export function ShopFilters({
  selectedFilters,
  onFilterChange,
  department,
  category,
  className,
}: ShopFiltersProps) {
  const filterCategories = getFilterCategories(department, category);

  return (
    <div className={cn("w-full", className)}>
      <Accordion type="multiple" defaultValue={["type", "brand", "pattern", "size"]} className="w-full">
        {filterCategories.map((cat) => (
          <AccordionItem key={cat.id} value={cat.id}>
            <AccordionTrigger className="text-base font-semibold">
              {cat.title}
            </AccordionTrigger>
            <AccordionContent>
              <div className="flex flex-col space-y-3 pt-1">
                {cat.options.map((option) => (
                  <div key={option.value} className="flex items-center space-x-3 space-x-reverse text-right">
                    <Checkbox
                      id={`filter-${cat.id}-${option.value}`}
                      checked={selectedFilters[cat.id]?.includes(option.value) || false}
                      onCheckedChange={(checked) =>
                        onFilterChange(cat.id, option.value, checked as boolean)
                      }
                    />
                    <Label
                      htmlFor={`filter-${cat.id}-${option.value}`}
                      className="text-sm font-normal cursor-pointer pr-2"
                    >
                      {option.label}
                    </Label>
                  </div>
                ))}
              </div>
            </AccordionContent>
          </AccordionItem>
        ))}
      </Accordion>
    </div>
  );
}
