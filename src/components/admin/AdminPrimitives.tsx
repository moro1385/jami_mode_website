import type {ReactNode} from 'react';
import {cn} from '@/lib/utils';
export function AdminPageHeader({title,description,action,eyebrow}:{title:string;description:string;action?:ReactNode;eyebrow?:string}){
 return <header className="admin-page-header"><div>{eyebrow&&<p className="admin-eyebrow">{eyebrow}</p>}<h1>{title}</h1><p className="admin-description">{description}</p></div>{action&&<div className="admin-header-action">{action}</div>}</header>;
}
export function AdminStat({label,value,note,icon}:{label:string;value:number|string|undefined;note?:string;icon?:ReactNode}){
 return <div className="admin-stat"><div><p>{label}</p><strong>{typeof value==='number'?value.toLocaleString('fa-IR'):value??'—'}</strong>{note&&<small>{note}</small>}</div>{icon&&<span className="admin-stat-icon">{icon}</span>}</div>;
}
export function AdminBadge({children,tone='neutral'}:{children:ReactNode;tone?:'neutral'|'success'|'warning'|'danger'}){return <span className={cn('admin-badge','admin-badge-'+tone)}>{children}</span>;}
