import React, { isValidElement } from 'react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';

interface EmptyStateProps {
  icon?: React.ReactNode | React.ElementType;
  title: string;
  description?: string;
  action?: React.ReactNode;
  className?: string;
}

export function EmptyState({ icon: Icon, title, description, action, className }: EmptyStateProps) {
  let renderedIcon: React.ReactNode = null;
  if (isValidElement(Icon)) {
    renderedIcon = Icon;
  } else if (Icon) {
    const Component = Icon as React.ElementType;
    renderedIcon = <Component className="h-6 w-6" />;
  }

  return (
    <motion.div
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3, ease: 'easeOut' }}
      className={cn(
        'flex flex-col items-center justify-center text-center gap-3 py-16 px-6',
        className
      )}
    >
      {renderedIcon && (
        <div className="w-14 h-14 rounded-2xl glass-card flex items-center justify-center text-muted-foreground mb-1">
          {renderedIcon}
        </div>
      )}
      <div className="space-y-1.5">
        <h3 className="text-base font-semibold">{title}</h3>
        {description && (
          <p className="text-sm text-muted-foreground max-w-xs">{description}</p>
        )}
      </div>
      {action && <div className="mt-2">{action}</div>}
    </motion.div>
  );
}
