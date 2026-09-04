// Optional colored badge shown left of the title -- one of the transparent
// icons under public/images/dashboard/icons/ (see HomeScreen.tsx's
// ICON_IMG), inset with padding so the icon renders at ~24px inside a 44px
// tinted box, matching the approved mobile mockup.
export interface PageHeaderIcon {
  img: string;
  bg: string;
}

export function PageHeader({
  title,
  subtitle,
  action,
  icon,
}: {
  title: string;
  subtitle?: string;
  action?: React.ReactNode;
  icon?: PageHeaderIcon;
}) {
  return (
    <div className="flex items-center justify-between">
      <div className="flex items-center gap-3">
        {icon ? (
          <img
            src={`${import.meta.env.BASE_URL}images/dashboard/icons/${icon.img}`}
            alt=""
            className="h-11 w-11 shrink-0 rounded-[14px] p-2.5"
            style={{ background: icon.bg }}
          />
        ) : null}
        <div>
          <h1 className="text-2xl font-bold text-neutral-800">{title}</h1>
          {subtitle ? <p className="text-sm text-neutral-500">{subtitle}</p> : null}
        </div>
      </div>
      {action}
    </div>
  );
}
