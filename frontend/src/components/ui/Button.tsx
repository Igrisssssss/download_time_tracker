import type { ButtonHTMLAttributes, ReactNode } from 'react';
import { cn } from '@/utils/cn';

type ButtonVariant = 'primary' | 'secondary' | 'ghost' | 'danger';
type ButtonSize = 'sm' | 'md' | 'lg';

const variantClasses: Record<ButtonVariant, string> = {
  primary:
    'bg-[linear-gradient(135deg,#020617_0%,#0f172a_30%,#0284c7_100%)] text-white shadow-[0_22px_50px_-24px_rgba(14,165,233,0.55)] hover:-translate-y-0.5 hover:shadow-[0_28px_58px_-24px_rgba(14,165,233,0.65)]',
  secondary:
    'border border-slate-200/90 bg-white/85 text-slate-700 shadow-[0_18px_38px_-28px_rgba(15,23,42,0.24)] hover:-translate-y-0.5 hover:border-slate-300 hover:bg-white',
  ghost:
    'text-slate-600 hover:bg-slate-100/80 hover:text-slate-950',
  danger:
    'bg-[linear-gradient(135deg,#7f1d1d_0%,#b91c1c_100%)] text-white shadow-[0_18px_40px_-24px_rgba(185,28,28,0.55)] hover:-translate-y-0.5 hover:shadow-[0_24px_48px_-24px_rgba(185,28,28,0.65)]',
};

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'min-h-9 rounded-full px-3.5 text-xs font-semibold',
  md: 'min-h-11 rounded-full px-4.5 text-sm font-semibold',
  lg: 'min-h-12 rounded-full px-5 text-sm font-semibold',
};

interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant;
  size?: ButtonSize;
  iconLeft?: ReactNode;
  iconRight?: ReactNode;
}

export default function Button({
  children,
  className,
  disabled,
  iconLeft,
  iconRight,
  size = 'md',
  type = 'button',
  variant = 'primary',
  ...props
}: ButtonProps) {
  return (
    <button
      type={type}
      disabled={disabled}
      className={cn(
        'inline-flex items-center justify-center gap-2 whitespace-nowrap transition duration-300 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-sky-300 disabled:cursor-not-allowed disabled:translate-y-0 disabled:opacity-60',
        variantClasses[variant],
        sizeClasses[size],
        className
      )}
      {...props}
    >
      {iconLeft}
      {children}
      {iconRight}
    </button>
  );
}
