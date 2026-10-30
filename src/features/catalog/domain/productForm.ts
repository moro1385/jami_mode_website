import * as z from 'zod/mini';
import {en} from 'zod/locales';

// Keep existing resolver messages without configuring a global validation locale.
export const productFormParseOptions={error:en().localeError};
export const productSchema=z.object({
 name:z.string().check(z.minLength(1,'Name is required')),
 slug:z.string().check(z.minLength(1,'Slug is required')),
 description:z.nullish(z.string()),
 price:z.coerce.number<number>().check(z.minimum(0,'Price must be positive')),
 is_active:z._default(z.boolean(),true),
 is_out_of_stock:z._default(z.boolean(),false),
 is_featured:z._default(z.boolean(),false),
 is_new:z._default(z.boolean(),false),
 category_id:z.nullish(z.string()),
 tags:z._default(z.array(z.string()),[]),
 department:z.nullish(z.string()),
 category:z.nullish(z.string()),
 type:z._default(z.array(z.string()),[]),
 colors:z._default(z.array(z.string()),[]),
 brand:z.optional(z.array(z.string())),
 pattern:z.nullish(z.string()),
 sizes:z._default(z.array(z.string()),[]),
});
export type ProductFormInput=z.input<typeof productSchema>;
export type ProductFormValues=z.output<typeof productSchema>;
