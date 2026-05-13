import React from 'react';
import { cn } from '@/shared/lib/classNames';

interface MobileFabProps {
  children: React.ReactNode;
  className?: string;
}

export const MobileFab: React.FC<MobileFabProps> = ({ children, className }) => (
  <div
    className={cn(
      'pointer-events-none fixed right-4 z-40 flex justify-end',
      'bottom-[calc(env(safe-area-inset-bottom,0px)+1.25rem)]',
      '[&>*]:pointer-events-auto [&>*]:shadow-lg',
      className,
    )}
  >
    {children}
  </div>
);
