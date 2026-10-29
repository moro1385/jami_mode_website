import { Router } from "express";
import multer from "multer";
import { createClient } from "@supabase/supabase-js";

const upload = multer().none(); // parses form-data fields into req.body
const router = Router();
const PRODUCTS_PER_PAGE = 100;
const BASE_URL = "https://jamimode.ir";

router.post("/products", upload, async (req, res) => {
  try {
    const supabaseUrl = process.env.SUPABASE_URL ?? '';
    const supabaseAnonKey = process.env.SUPABASE_ANON_KEY ?? '';
    const supabase = createClient(supabaseUrl, supabaseAnonKey);
    
const params = { ...(req.query || {}), ...(req.body || {}) };
const safeDecode = (v) => { try { return decodeURIComponent(v); } catch { return v; } };
const page = params.page;
const page_unique = params.page_unique ? safeDecode(String(params.page_unique).trim()) : undefined;
const page_url = params.page_url ? String(params.page_url).trim() : undefined;


    let query = supabase
      .from("products")
      .select("id, name, slug, description, price, is_out_of_stock, images, categories:category_id(name), product_images(image_url, sort_order), created_at")
      .eq("is_active", true);

    if (page_unique) {
      query = query.eq("slug", page_unique);
    } else if (page_url) {
      // strip query params and extract the slug from the end of the path
      const cleanUrl = page_url.split("?")[0];
      const slug = decodeURIComponent(cleanUrl.split("/").filter(Boolean).pop() || "");
      query = query.eq("slug", slug);
    }

    const { data: allMatching, error: countError } = await query;
    if (countError) throw countError;

    const mapProduct = (p) => {
      const images = p.images?.length
        ? p.images
        : (p.product_images || [])
            .sort((a, b) => a.sort_order - b.sort_order)
            .map((img) => img.image_url);
      return {
        title: p.name,
        page_unique: p.slug,
        current_price: Math.round(Number(p.price)),
        availability: !p.is_out_of_stock,
        category_name: p.categories?.name || "",
        image_link: images[0] || "",
        image_links: images,
        page_url: `${BASE_URL}/product/${p.slug}`,
        short_desc: (p.description || "").slice(0, 200),
        spec: p.categories?.name ? { "دسته‌بندی": p.categories.name } : {},
        date_added: p.created_at ? new Date(p.created_at).toISOString().replace(/\.\d{3}Z$/, "+00:00") : undefined,
      };
    };

    if (page_unique || page_url) {
      return res.json({
        api_version: "torob_api_v3",
        count: String(allMatching.length),
        current_page: 1,
        max_pages: 1,
        products: allMatching.map(mapProduct),
      });
    }

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const start = (pageNum - 1) * PRODUCTS_PER_PAGE;
    const pageItems = allMatching.slice(start, start + PRODUCTS_PER_PAGE);

    res.json({
      api_version: "torob_api_v3",
      count: String(allMatching.length),
      current_page: pageNum,
      max_pages: Math.max(1, Math.ceil(allMatching.length / PRODUCTS_PER_PAGE)),
      products: pageItems.map(mapProduct),
    });
  } catch {
    res.status(500).json({ api_version: "torob_api_v3", count: "0", current_page: 1, max_pages: 0, products: [] });
  }
});

export default router;