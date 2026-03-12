import type { HTMLAttributes } from 'react';
import { cn } from '@/utils/cn';

interface BrandLogoProps extends HTMLAttributes<HTMLDivElement> {
  variant?: 'full' | 'icon';
  size?: 'sm' | 'md' | 'lg';
  alt?: string;
}

const wrapperSizeMap = {
  full: {
    sm: 'h-[3.25rem]',
    md: 'h-15',
    lg: 'h-[4.25rem]',
  },
  icon: {
    sm: 'h-11 w-11',
    md: 'h-[3.25rem] w-[3.25rem]',
    lg: 'h-16 w-16',
  },
} as const;

const assetMap = {
  full: '/carevance-logo-full.png',
  icon: '/carevance-logo-icon.png',
} as const;

export default function BrandLogo({
  variant = 'full',
  size = 'md',
  alt = 'CareVance',
  className,
  ...props
}: BrandLogoProps) {
  return (
    <div
      className={cn(
        'inline-flex shrink-0 items-center justify-start overflow-hidden align-middle',
        wrapperSizeMap[variant][size],
        variant === 'full' ? 'w-full' : '',
        className
      )}
      {...props}
    >
      <img
        src={assetMap[variant]}
        alt={alt}
        className={cn(
          'block max-w-full object-contain',
          variant === 'full' ? 'h-full w-auto' : 'h-full w-full'
        )}
      />
    </div>
  );
}
