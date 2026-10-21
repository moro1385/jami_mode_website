import { useDepartmentDialog } from "@/hooks/useDepartmentDialog";

const categories = [
  { handle: "socks", label: "جوراب", Icon: SockIcon },
  { handle: "underwear", label: "شورت", Icon: UnderwearIcon },
  { handle: "undershirts", label: "زیرپوش", Icon: UndershirtIcon },
  { handle: "pants", label: "شلوار", Icon: PantsIcon },
  { handle: "shorts", label: "شلوارک", Icon: ShortsIcon },
  { handle: "t-shirts", label: "تیشرت", Icon: TshirtIcon },
  { handle: "tank-tops", label: "تاپ", Icon: TankTopIcon },
  { handle: "sets", label: "ست‌ها", Icon: SetIcon },
];

export default function CategoryQuickNav() {
  const { openDialogFor, departmentDialog } = useDepartmentDialog();

  return (
    <>
      <section className="py-10 bg-background max-w-7xl mx-auto px-6">
        <div className="flex overflow-x-auto md:flex-wrap md:justify-center gap-4 scrollbar-hide pb-4 md:pb-0">
          {categories.map((cat) => (
            <button
              key={cat.handle}
              onClick={() => openDialogFor(cat.handle, cat.label)}
              className="flex flex-col items-center justify-center gap-3 p-4 min-w-[90px] md:min-w-[110px] rounded-2xl border border-border hover:border-accent hover:shadow-xs transition-all bg-card"
            >
              <cat.Icon className="w-8 h-8 text-accent" />
              <span className="text-sm font-medium text-foreground whitespace-nowrap">{cat.label}</span>
            </button>
          ))}
        </div>
      </section>

      {departmentDialog}
    </>
  );
}

// Icons
function SockIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M9 2h6v9.5c1.8 0.7 3.6 2 4.4 3.8c1 2.2 0.1 4.8-2.3 6.1c-2.4 1.3-5.5 1-7.3-0.9c-1.1-1.2-1.3-2.8-1.3-4.4z" />
    </svg>
  );
}

function UnderwearIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M4 8h16l-2 10H6L4 8z" />
      <path d="M9 18c0-3 1.5-5 3-5s3 2 3 5" />
    </svg>
  );
}

function UndershirtIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M7 3h10l2 6v12H5V9l2-6z" />
      <path d="M7 3c0 2 2 4 5 4s5-2 5-4" />
    </svg>
  );
}

function PantsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M7 3h10l1 18h-4l-2-12-2 12H6L7 3z" />
      <path d="M7 3c1 3 2 3 10 0" />
    </svg>
  );
}

function ShortsIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M6 3h12l1 12h-5l-2-6-2 6H5L6 3z" />
      <path d="M6 3c1 2 2 2 12 0" />
    </svg>
  );
}

function TshirtIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M20.38 3.46 16 2a8.5 8.5 0 0 1-8 0L3.62 3.46a2 2 0 0 0-1.34 2.23l.58 3.48a1 1 0 0 0 .99.83H6v12h12V10h2.15a1 1 0 0 0 .99-.83l.58-3.48a2 2 0 0 0-1.34-2.23z" />
    </svg>
  );
}

function TankTopIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      <path d="M8 2h8l3 7v13H5V9l3-7z" />
      <path d="M8 2c0 3 2 5 4 5s4-2 4-5" />
    </svg>
  );
}

function SetIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg viewBox="0 0 24 24" stroke="currentColor" fill="none" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" {...props}>
      {/* Shirt */}
      <path d="M16 2a4.5 4.5 0 0 1-4 0L9.5 2.5a1 1 0 0 0-.67 1.12l.29 1.74a.5.5 0 0 0 .5.41H10v5h8V5.77a.5.5 0 0 0 .5-.41l.29-1.74a1 1 0 0 0-.67-1.12L16 2z" />
      {/* Pants/Shorts */}
      <path d="M8 12h12l1 10h-4l-2-6-2 6H7l1-10z" />
    </svg>
  );
}
