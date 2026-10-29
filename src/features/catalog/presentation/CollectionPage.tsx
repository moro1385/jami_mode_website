import {Link} from 'react-router-dom';
import ProductCard from '@/components/ProductCard';
import {CatalogReadError} from './CatalogReadError';
import {useCollectionProducts} from './useProducts';
interface CollectionCopy {title:string;description:string;intro:string;body:string;categories:readonly string[];}
export default function CollectionPage({collection}:{collection:CollectionCopy}) {
 const {data:products,error,isLoading,isFetching,refetch}=useCollectionProducts(collection.categories);
 return <div className="max-w-7xl mx-auto px-6 py-12 md:py-16">
  <nav aria-label="مسیر راهنما" className="text-sm text-muted-foreground mb-8"><Link to="/" className="hover:underline">خانه</Link><span aria-hidden="true" className="mx-2">›</span><span aria-current="page">{collection.title}</span></nav>
  <header className="max-w-3xl mb-10"><h1 className="text-3xl md:text-4xl font-bold mb-5">{collection.title}</h1><h2 className="text-lg md:text-xl mb-3">{collection.intro}</h2><p className="text-muted-foreground leading-8">{collection.body}</p><Link to="/size-guide" className="inline-block mt-4 underline underline-offset-4">راهنمای انتخاب سایز</Link></header>
  {isLoading?<p role="status" className="py-12 text-center">در حال دریافت محصولات…</p>
   :error?<CatalogReadError retry={refetch} busy={isFetching}/>
   :products.length===0?<div className="py-12 text-center"><p>در حال حاضر محصولی در این مجموعه موجود نیست.</p><Link to="/shop" className="inline-block mt-4 underline">مشاهدهٔ همهٔ محصولات</Link></div>
   :<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-8">{products.map(product=><ProductCard key={product.node.id} product={product}/>)}</div>}
  <div className="mt-12 border-t border-border pt-6"><Link to="/shop" className="underline underline-offset-4">مشاهدهٔ فروشگاه</Link></div>
 </div>;
}
