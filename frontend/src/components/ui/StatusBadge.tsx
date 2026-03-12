import { cn } from '@/utils/cn';

type BadgeTone = 'neutral' | 'info' | 'success' | 'warning' | 'danger';

const toneClasses: Record<BadgeTone, string> = {
  neutral: 'border-slate-200 bg-slate-100/90 text-slate-700',
  info: 'border-sky-200 bg-sky-100/90 text-sky-700',
  success: 'border-emerald-200 bg-emerald-100/90 text-emerald-700',
  warning: 'border-amber-200 bg-amber-100/90 text-amber-700',
  danger: 'border-rose-200 bg-rose-100/90 text-rose-700',
};

export default function StatusBadge({
  children,
  tone = 'neutral',
  className,
}: {
  children: React.ReactNode;
  tone?: BadgeTone;
  className?: string;
}) {
  return (
    <span
      className={cn(
        'inline-flex items-center rounded-full border px-2.5 py-1 text-[11px] font-semibold uppercase tracking-[0.18em]',
        toneClasses[tone],
        className
      )}
    >
      {children}
    </span>
  );
}
