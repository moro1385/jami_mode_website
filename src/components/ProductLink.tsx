import {Link} from 'react-router-dom';
import type {ReactNode} from 'react';
import {productPath} from '../../config/seo.js';
// Match the canonical/sitemap URL. Keep invalid legacy data visible without a broken link.
export default function ProductLink({slug,children,className,fallback='span'}:{slug:string;children:ReactNode;className?:string;fallback?:'span'|'div'}) {
 const href=productPath(slug);
 if(href)return <Link to={href} className={className}>{children}</Link>;
 return fallback==='div'?<div className={className}>{children}</div>:<span className={className}>{children}</span>;
}
