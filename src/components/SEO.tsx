import { Helmet } from 'react-helmet-async';
import { useLocation } from 'react-router-dom';
import { publicSeoImage, routeSeo } from '../../config/seo.js';
interface SEOProps {title:string;description:string;image?:string;noindex?:boolean;}
export default function SEO({title,description,image,noindex=false}:SEOProps) {
 const {pathname}=useLocation(),policy=routeSeo(pathname),picture=publicSeoImage(image);
 const fullTitle=`${title} | جامی مد`;
 return <Helmet>
  <title>{fullTitle}</title>
  <meta name="description" content={description}/>
  <meta name="robots" content={policy.indexable&&!noindex?'index, follow':'noindex, follow'}/>
  {policy.canonical&&!noindex&&<link rel="canonical" href={policy.canonical}/>}
  {policy.canonical&&!noindex&&<meta property="og:url" content={policy.canonical}/>}
  <meta property="og:type" content="website"/>
  <meta property="og:title" content={fullTitle}/><meta property="og:description" content={description}/>
  {picture&&<meta property="og:image" content={picture}/>}
  <meta name="twitter:card" content={picture?'summary_large_image':'summary'}/>
  <meta name="twitter:title" content={fullTitle}/><meta name="twitter:description" content={description}/>
  {picture&&<meta name="twitter:image" content={picture}/>}
 </Helmet>;
}
