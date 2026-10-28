import type { ComponentPropsWithRef, ReactNode } from 'react';

export type CardVariant = 'story' | 'rule' | 'example' | 'question' | 'resolved';

const VARIANTS: Record<CardVariant, string> = {
  story: 'bg-amber-100 border-amber-300',
  rule: 'bg-sky-100 border-sky-300',
  example: 'bg-emerald-50 border-emerald-300',
  question: 'bg-rose-100 border-rose-300',
  resolved: 'bg-stone-100 border-stone-200 text-stone-500',
};

type CardProps = ComponentPropsWithRef<'div'> & {
  variant: CardVariant;
  highlighted?: boolean;
  actions?: ReactNode;
};

export function Card({
  variant,
  highlighted,
  actions,
  className = '',
  children,
  ...rest
}: CardProps) {
  return (
    <div
      {...rest}
      data-highlighted={highlighted || undefined}
      className={`group relative rounded-md border p-3 text-sm shadow-sm transition-shadow ${VARIANTS[variant]} ${
        highlighted ? 'ai-highlight' : ''
      } ${className}`}
    >
      {children}
      {actions && (
        <div className="absolute top-1 right-1 flex gap-1 opacity-0 transition-opacity group-focus-within:opacity-100 group-hover:opacity-100">
          {actions}
        </div>
      )}
    </div>
  );
}

export function CardAction({
  label,
  onClick,
  children,
}: {
  label: string;
  onClick: () => void;
  children: ReactNode;
}) {
  return (
    <button
      type="button"
      aria-label={label}
      title={label}
      onClick={onClick}
      onPointerDown={(e) => e.stopPropagation()}
      className="rounded px-1.5 py-0.5 text-xs text-stone-600 hover:bg-black/10 hover:text-stone-900"
    >
      {children}
    </button>
  );
}
