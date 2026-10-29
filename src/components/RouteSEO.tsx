import {useLocation} from 'react-router-dom';
import SEO from './SEO';
import {routeDescription,routeSeo} from '../../config/seo.js';
// Present outside Suspense, including private routes and page loading states.
export default function RouteSEO(){const {pathname}=useLocation();if(pathname.startsWith('/product/')&&routeSeo(pathname).indexable)return null;return <SEO title={routeSeo(pathname).title} description={routeDescription(pathname)}/>;}
