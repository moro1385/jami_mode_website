import { useAuthStore } from '@/stores/authStore';
import { useScopedAction } from '@/shared/presentation/useScopedAction';
import { useScopedAsyncRead } from '@/shared/presentation/useScopedAsyncRead';
import { ReadFailure } from '@/shared/presentation/ReadFailure';
import { errorMessage } from "@/lib/errors";
import { useState, useEffect, useCallback } from "react";
import { useForm } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import {productSchema,productFormParseOptions,type ProductFormInput,type ProductFormValues} from '@/features/catalog/domain/productForm';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from "@/components/ui/dialog";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "@/components/ui/form";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { adminProducts, type AdminProduct as Product } from "@/features/catalog/admin";
import { toast } from "sonner";
import { getBrandOptions } from "@/lib/brands";
import { colorNames } from "@/lib/translations";
import { slugify } from "@/lib/slugify";
import { ProductVariantsManager } from './ProductVariantsManager';
import { ProductImagesManager } from "./ProductImagesManager";
import { fetchCategories } from "@/services/products";
import { X } from "lucide-react";

type Category = { id: string; name: string; slug: string };

interface ProductFormDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  product?: Product | null;
  onSuccess: () => void;
}

export function ProductFormDialog(props: ProductFormDialogProps) {
 const ownerId = useAuthStore(state => state.user?.id);
 if (!props.open) return null;
 return <ProductFormDialogContent key={JSON.stringify([ownerId, props.product?.id])} {...props} ownerId={ownerId} />;
}
function ProductFormDialogContent({ open, onOpenChange, product, onSuccess, ownerId }: ProductFormDialogProps & { ownerId?: string }) {
 const actions = useScopedAction(ownerId ? JSON.stringify([ownerId, product?.id]) : undefined);
 const loadCategories = useCallback(() => fetchCategories(), []);
 const categoryRead = useScopedAsyncRead(ownerId, loadCategories);
 const categories = categoryRead.value ?? [];
 const isSubmitting = actions.pending('save');
  const [tagInput, setTagInput] = useState("");
  const [slugManuallyEdited, setSlugManuallyEdited] = useState(false);

  const form = useForm<ProductFormInput, unknown, ProductFormValues>({
    resolver: zodResolver(productSchema,productFormParseOptions),
    defaultValues: {
      name: "",
      slug: "",
      description: "",
      price: 0,
      is_active: true,
      is_out_of_stock: false,
      is_featured: false,
      is_new: false,
      category_id: null,
      tags: [],

      department: null,
      category: null,
      type: [],
        colors: [],
      brand: [],
      pattern: null,
      sizes: [],

    },
  });

  const department = form.watch("department");
  const category = form.watch("category");
  const name = form.watch("name");

  useEffect(() => {
    if (!product && !slugManuallyEdited && name) {
      form.setValue("slug", slugify(name), { shouldValidate: true });
    } else if (!product && !slugManuallyEdited && !name) {
      form.setValue("slug", "", { shouldValidate: true });
    }
  }, [name, product, slugManuallyEdited, form]);

  const [typeOptions, setTypeOptions] = useState<{ value: string; label: string }[]>([]);
  const [brandOptions, setBrandOptions] = useState<{ value: string; label: string }[]>([]);
  const [patternOptions, setPatternOptions] = useState<{ value: string; label: string }[]>([]);
  const [sizeOptions, setSizeOptions] = useState<{ value: string; label: string }[]>([]);
  const [colorOptions, setColorOptions] = useState<{ value: string; label: string }[]>([]);

  useEffect(() => {
    let tOptions: { value: string; label: string }[] = [];
    let sOptions: { value: string; label: string }[] = [
      { value: "S", label: "S" },
      { value: "M", label: "M" },
      { value: "L", label: "L" },
      { value: "XL", label: "XL" },
      { value: "2XL", label: "2XL" },
      { value: "3XL", label: "3XL" },
      { value: "4XL", label: "4XL" },
      { value: "5XL", label: "5XL" },
    ];
    let pOptions = [
      { value: "رنگی", label: "رنگی (Colored)" },
      { value: "طرح‌دار", label: "طرح‌دار (Patterned)" },
      { value: "ساده", label: "ساده (Plain)" },
    ];

    const bOptions = getBrandOptions(department, category);

    if (category === "underwear") {
      pOptions = [
        { value: "طرح‌دار", label: "طرح‌دار (Patterned)" },
        { value: "ساده", label: "ساده (Plain)" },
      ];
      if (department === "men") {
        tOptions = [
          { value: "شورت اسلیپ", label: "شورت اسلیپ" },
          { value: "شورت نیم پا", label: "شورت نیم پا" },
          { value: "شورت پادار", label: "شورت پادار" },
          { value: "شورت باکسر", label: "شورت باکسر" },
          { value: "شورت اسپورت", label: "شورت اسپورت" },
        ];
      } else if (department === "women") {
        tOptions = [{ value: "شورت اسلیپ", label: "شورت اسلیپ" }];
      } else if (department === "kids") {
        tOptions = [
          { value: "اسلیپ", label: "اسلیپ" },
          { value: "پادار", label: "پادار" },
        ];
      }
    } else if (category === "undershirts") {
      if (department === "men") {
        tOptions = [
          { value: "رکابی", label: "رکابی" },
          { value: "نیم آستین", label: "نیم آستین" },
          { value: "خشتی", label: "خشتی" },
          { value: "حلقه‌ای", label: "حلقه‌ای" },
          { value: "پشت قهرمانی", label: "پشت قهرمانی" },
        ];
      } else if (department === "women") {
        tOptions = [
          { value: "رکابی", label: "رکابی" },
          { value: "نیم تنه", label: "نیم تنه" },
        ];
      } else if (department === "kids") {
        tOptions = [
          { value: "زیرپوش", label: "زیرپوش" },
        ];
      }
    } else if (category === "pants") {
      if (department === "men") {
        tOptions = [
          { value: "شلوار ورزشی", label: "شلوار ورزشی" },
          { value: "شلوار ساده", label: "شلوار ساده" },
          { value: "شلوار اسلش", label: "شلوار اسلش" },
          { value: "شلوار دمپا کش", label: "شلوار دمپا کش" },
          { value: "شلوار آیرو", label: "شلوار آیرو" },
          { value: "شلوار نخی", label: "شلوار نخی" },
        ];
      } else if (department === "women") {
        tOptions = [
          { value: "شلوار ساده", label: "شلوار ساده" },
          { value: "شلوار ورزشی", label: "شلوار ورزشی" },
          { value: "شلوار نخی", label: "شلوار نخی" },
          { value: "ساق شلواری", label: "ساق شلواری" },
          { value: "شلوار آیرو", label: "شلوار آیرو" },
        ];
      }
    } else if (category === "shorts") {
      if (department === "men") {
        tOptions = [
          { value: "شلوارک کوتاه", label: "شلوارک کوتاه" },
          { value: "شلوارک بلند", label: "شلوارک بلند" },
          { value: "شلوارک ساده", label: "شلوارک ساده" },
          { value: "شلوارک ورزشی", label: "شلوارک ورزشی" },
        ];
      } else if (department === "women") {
        tOptions = [
          { value: "شلوارک کوتاه", label: "شلوارک کوتاه" },
          { value: "شلوارک بلند", label: "شلوارک بلند" },
          { value: "شلوارک ساده", label: "شلوارک ساده" },
          { value: "شلوارک ورزشی", label: "شلوارک ورزشی" },
          { value: "شورتک", label: "شورتک" },
        ];
      }
    } else if (category === "t-shirts") {
      if (department === "men" || department === "women") {
        tOptions = [
          { value: "تیشرت ساده", label: "تیشرت ساده" },
          { value: "تیشرت ورزشی", label: "تیشرت ورزشی" },
          { value: "تیشرت آیرو", label: "تیشرت آیرو" },
          { value: "تیشرت سوزنی", label: "تیشرت سوزنی" },
        ];
      }
    } else if (category === "tank-tops") {
      if (department === "men") {
        tOptions = [
          { value: "تاپ ساده", label: "تاپ ساده" },
          { value: "تاپ ورزشی", label: "تاپ ورزشی" },
          { value: "تاپ آیکو", label: "تاپ آیکو" },
          { value: "تاپ سوزنی", label: "تاپ سوزنی" },
        ];
      } else if (department === "women") {
        tOptions = [
          { value: "تاپ ساده", label: "تاپ ساده" },
          { value: "تاپ ورزشی", label: "تاپ ورزشی" },
          { value: "تاپ آیکو", label: "تاپ آیکو" },
          { value: "تاپ سوزنی", label: "تاپ سوزنی" },
          { value: "تاپ راه راه", label: "تاپ راه راه" },
        ];
      }
    } else if (category === "sets") {
      if (department === "men") {
        tOptions = [
          { value: "ست بلوز و شلوار", label: "ست بلوز و شلوار" },
          { value: "ست تیشرت و شلوار", label: "ست تیشرت و شلوار" },
          { value: "ست تیشرت و شلوارک", label: "ست تیشرت و شلوارک" },
          { value: "ست تاپ و شلوارک", label: "ست تاپ و شلوارک" },
          { value: "ست زیر پوش و شورت", label: "ست زیر پوش و شورت" },
        ];
      } else if (department === "women") {
        tOptions = [
          { value: "ست بلوز و شلوار", label: "ست بلوز و شلوار" },
          { value: "ست تیشرت و شلوارک", label: "ست تیشرت و شلوارک" },
          { value: "ست تاپ و شلوارک", label: "ست تاپ و شلوارک" },
        ];
      }
    } else if (category === "socks") {
      sOptions = [{ value: "فری سایز", label: "فری سایز (Free Size)" }];
      tOptions = [
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

    const cOptions = Object.entries(colorNames).map(([value, label]) => ({
      value,
      label: `${label} (${value})`,
    }));
    setColorOptions(cOptions);

    setTypeOptions(tOptions);
    setSizeOptions(sOptions);
    setPatternOptions(pOptions);
    setBrandOptions(bOptions);

    if (category === "socks") {
        form.setValue("sizes", ["فری سایز"]);
    } else {
        const currentSizes = form.getValues("sizes") || [];
        if (currentSizes.includes("فری سایز")) {
            form.setValue("sizes", []);
        }
    }
  }, [department, category, form]);



  useEffect(() => {
    if (product) {
      setSlugManuallyEdited(true);
      form.reset({
        name: product.name,
        slug: product.slug,
        description: product.description || "",
        price: product.price,
        is_active: product.is_active,
        is_out_of_stock: product.is_out_of_stock,
        is_featured: product.is_featured,
        is_new: product.is_new,
        category_id: product.category_id,
        tags: product.tags || [],

        department: product.department || null,
        category: product.category || null,
        type: Array.isArray(product.type) ? product.type : product.type ? [product.type] : [],
        colors: Array.isArray(product.colors) ? product.colors : product.colors ? [product.colors] : [],
        brand: Array.isArray(product.brand) ? product.brand : product.brand ? [product.brand] : [],
        pattern: product.pattern || null,
        sizes: Array.isArray(product.sizes) ? product.sizes : product.sizes ? [product.sizes] : [],

      });
    } else {
      setSlugManuallyEdited(false);
      form.reset({
        name: "",
        slug: "",
        description: "",
        price: 0,
        is_active: true,
        is_out_of_stock: false,
        is_featured: false,
        is_new: false,
        category_id: null,
        tags: [],

        department: null,
        category: null,
        type: [],
        colors: [],
        brand: [],
        pattern: null,
        sizes: [],

      });
    }
    setTagInput("");
  }, [product, form]);

  const handleAddTag = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === "Enter") {
      e.preventDefault();
      const newTag = tagInput.trim();
      if (newTag) {
        const currentTags = form.getValues("tags") || [];
        if (!currentTags.includes(newTag)) {
          form.setValue("tags", [...currentTags, newTag]);
        }
        setTagInput("");
      }
    }
  };

  const handleRemoveTag = (tagToRemove: string) => {
    const currentTags = form.getValues("tags") || [];
    form.setValue("tags", currentTags.filter((tag) => tag !== tagToRemove));
  };

  async function onSubmit(values: ProductFormValues) {
    const result = await actions.run('save', () => adminProducts.saveProduct(values, product?.id));
    if (result.kind === 'success') {
      toast.success(product ? 'محصول با موفقیت به‌روز شد' : 'محصول با موفقیت ایجاد شد');
      onSuccess(); onOpenChange(false);
    } else if (result.kind === 'failed') {
      const error = result.error; console.error('Product save failed:', error);
      if ((typeof error === 'object' && error !== null && 'code' in error && error.code === '23505') || errorMessage(error, '').includes('products_slug_key')) toast.error('این نامک (Slug) قبلاً برای محصول دیگری استفاده شده — لطفاً کمی تغییرش بده.');
      else toast.error(errorMessage(error, 'ذخیره محصول با شکست مواجه شد'));
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[600px] max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{product ? "ویرایش محصول" : "افزودن محصول"}</DialogTitle>
          <DialogDescription>
            {product ? "در اینجا می‌توانید محصول را ویرایش کنید." : "محصول جدیدی به فروشگاه خود اضافه کنید."}
          </DialogDescription>
        </DialogHeader>

        {!!categoryRead.error && <ReadFailure retry={categoryRead.retry} message="دریافت دسته‌بندی‌ها انجام نشد." />}
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <fieldset disabled={isSubmitting} className="contents">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>نام</FormLabel>
                  <FormControl>
                    <Input placeholder="Product name" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="slug"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>شناسه</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="product-slug"
                      {...field}
                      onChange={(e) => {
                        setSlugManuallyEdited(true);
                        field.onChange(e);
                      }}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />


            <div className="grid grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="department"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>بخش</FormLabel>
                    <Select onValueChange={(val) => field.onChange(val === "null" ? null : val)} value={field.value || "null"}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="null">هیچکدام</SelectItem>
                        <SelectItem value="men">مردانه</SelectItem>
                        <SelectItem value="women">زنانه</SelectItem>
                        <SelectItem value="kids">بچگانه</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_out_of_stock"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 w-full">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">ناموجود</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>دسته‌بندی</FormLabel>
                    <Select onValueChange={(val) => field.onChange(val === "null" ? null : val)} value={field.value || "null"}>
                      <FormControl>
                        <SelectTrigger><SelectValue placeholder="Select category" /></SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="null">هیچکدام</SelectItem>
                        <SelectItem value="socks">جوراب</SelectItem>
                        <SelectItem value="underwear">شورت</SelectItem>
                        <SelectItem value="undershirts">زیرپوش</SelectItem>
                        <SelectItem value="pants">شلوار</SelectItem>
                        <SelectItem value="shorts">شلوارک</SelectItem>
                        <SelectItem value="t-shirts">تی‌شرت</SelectItem>
                        <SelectItem value="tank-tops">تاپ</SelectItem>
                        <SelectItem value="sets">ست</SelectItem>
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            {department && category && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="type"
                  render={() => (
                    <FormItem>
                      <div className="mb-4">
                        <FormLabel>نوع‌ها</FormLabel>
                      </div>
                      <div className="flex flex-wrap gap-4">
                        {typeOptions.map((item) => (
                          <FormField
                            key={item.value}
                            control={form.control}
                            name="type"
                            render={({ field }) => (
                              <FormItem key={item.value} className="flex flex-row items-start gap-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(item.value)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...(field.value || []), item.value])
                                        : field.onChange(field.value?.filter((val) => val !== item.value))
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal leading-none">{item.label}</FormLabel>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />
                <FormField
                  control={form.control}
                  name="colors"
                  render={() => (
                    <FormItem>
                      <div className="mb-4">
                        <FormLabel>رنگ‌ها</FormLabel>
                      </div>
                      <div className="flex flex-wrap gap-4">
                        {colorOptions.map((item) => (
                          <FormField
                            key={item.value}
                            control={form.control}
                            name="colors"
                            render={({ field }) => (
                              <FormItem key={item.value} className="flex flex-row items-start gap-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(item.value)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...(field.value || []), item.value])
                                        : field.onChange(field.value?.filter((val) => val !== item.value))
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal leading-none">{item.label}</FormLabel>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="brand"
                  render={() => (
                    <FormItem>
                      <div className="mb-4">
                        <FormLabel>برند</FormLabel>
                      </div>
                      <div className="flex flex-wrap gap-4">
                        {brandOptions.map((item) => (
                          <FormField
                            key={item.value}
                            control={form.control}
                            name="brand"
                            render={({ field }) => (
                              <FormItem key={item.value} className="flex flex-row items-start gap-3 space-y-0">
                                <FormControl>
                                  <Checkbox
                                    checked={field.value?.includes(item.value)}
                                    onCheckedChange={(checked) => {
                                      return checked
                                        ? field.onChange([...(field.value || []), item.value])
                                        : field.onChange(field.value?.filter((val) => val !== item.value))
                                    }}
                                  />
                                </FormControl>
                                <FormLabel className="font-normal leading-none">{item.label}</FormLabel>
                              </FormItem>
                            )}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              </div>
            )}

            {department && category && (
              <div className="grid grid-cols-2 gap-4">
                <FormField
                  control={form.control}
                  name="pattern"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>طرح/رنگ</FormLabel>
                      <Select onValueChange={(val) => field.onChange(val === "null" ? null : val)} value={field.value || "null"}>
                        <FormControl>
                          <SelectTrigger><SelectValue placeholder="Select pattern" /></SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          <SelectItem value="null">هیچکدام</SelectItem>
                          {patternOptions.map(opt => (
                            <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <FormField
                  control={form.control}
                  name="sizes"
                  render={() => (
                    <FormItem>
                      <div className="mb-4">
                        <FormLabel>سایزها</FormLabel>
                      </div>
                      <div className="flex flex-wrap gap-4">
                        {sizeOptions.map((item) => (
                          <FormField
                            key={item.value}
                            control={form.control}
                            name="sizes"
                            render={({ field }) => {
                              return (
                                <FormItem
                                  key={item.value}
                                  className="flex flex-row items-start gap-3 space-y-0"
                                >
                                  <FormControl>
                                    <Checkbox
                                      checked={field.value?.includes(item.value)}
                                      disabled={category === "socks"}
                                      onCheckedChange={(checked) => {
                                        return checked
                                          ? field.onChange([...field.value, item.value])
                                          : field.onChange(
                                              field.value?.filter(
                                                (value) => value !== item.value
                                              )
                                            )
                                      }}
                                    />
                                  </FormControl>
                                  <FormLabel className="font-normal leading-none">
                                    {item.label}
                                  </FormLabel>
                                </FormItem>
                              )
                            }}
                          />
                        ))}
                      </div>
                      <FormMessage />
                    </FormItem>
                  )}
                />

              </div>
            )}

            <div className="flex gap-4">
              <FormField
                control={form.control}
                name="price"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>قیمت</FormLabel>
                    <FormControl>
                      <Input type="number" step="0.01" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="category_id"
                render={({ field }) => (
                  <FormItem className="flex-1">
                    <FormLabel>دسته‌بندی (اختیاری)</FormLabel>
                    <Select
                      onValueChange={(val) => field.onChange(val === "null" ? null : val)}
                      value={field.value || "null"}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Select a category" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        <SelectItem value="null">هیچکدام</SelectItem>
                        {categories.map((category) => (
                          <SelectItem key={category.id} value={category.id}>
                            {category.name}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>توضیحات</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Product description"
                      className="resize-none"
                      {...field}
                      value={field.value || ""}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="tags"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>برچسب‌ها</FormLabel>
                  <FormControl>
                    <div className="space-y-2">
                      <Input
                        placeholder="افزودن برچسب (با زدن دکمه اینتر)"
                        value={tagInput}
                        onChange={(e) => setTagInput(e.target.value)}
                        onKeyDown={handleAddTag}
                      />
                      {field.value && field.value.length > 0 && (
                        <div className="flex flex-wrap gap-2">
                          {field.value.map((tag) => (
                            <Badge key={tag} variant="secondary" className="flex items-center gap-1">
                              {tag}
                              <button
                                type="button"
                                onClick={() => handleRemoveTag(tag)}
                                className="text-muted-foreground hover:text-foreground"
                              >
                                <X className="w-3 h-3" />
                              </button>
                            </Badge>
                          ))}
                        </div>
                      )}
                    </div>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="flex gap-6 pt-2">
              <FormField
                control={form.control}
                name="is_active"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 w-full">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">فعال</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_featured"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 w-full">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">ویژه</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="is_new"
                render={({ field }) => (
                  <FormItem className="flex flex-row items-center justify-between rounded-lg border p-4 w-full">
                    <div className="space-y-0.5">
                      <FormLabel className="text-base">جدیدترین</FormLabel>
                    </div>
                    <FormControl>
                      <Switch
                        checked={field.value}
                        onCheckedChange={field.onChange}
                      />
                    </FormControl>
                  </FormItem>
                )}
              />
            </div>

            <DialogFooter className="pt-4 gap-2">
              <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
                لغو
              </Button>
              <Button type="submit" disabled={isSubmitting}>
                {isSubmitting ? "در حال ذخیره..." : "ذخیره محصول"}
              </Button>
            </DialogFooter>
            </fieldset>
          </form>
        </Form>

        {product && (
          <div className="mt-8 space-y-8 border-t pt-4">
             <ProductImagesManager productId={product.id} />
             <ProductVariantsManager productId={product.id} />
             </div>
        )}

        {!product && (
          <div className="mt-4 pt-4 text-sm text-muted-foreground text-center border-t">
            برای مدیریت تصاویر، ابتدا محصول را ذخیره کنید.
          </div>
        )}

      </DialogContent>
    </Dialog>
  );
}
