import { cva, type VariantProps } from 'class-variance-authority'
import { Slot } from 'radix-ui'
import type { ButtonHTMLAttributes } from 'react'
import { cn } from './cn'

const button = cva(
  'no-drag inline-flex select-none items-center justify-center gap-2 whitespace-nowrap rounded-lg font-semibold transition-colors disabled:pointer-events-none disabled:opacity-40',
  {
    variants: {
      variant: {
        primary: 'bg-accent text-on-accent hover:bg-accent/90 active:bg-accent-dim',
        secondary: 'border border-line-strong bg-panel-2 text-ink hover:bg-panel-3',
        ghost: 'text-ink-dim hover:bg-panel-2 hover:text-ink',
        danger: 'border border-bad/40 bg-bad/10 text-bad hover:bg-bad/20',
      },
      size: {
        sm: 'h-8 px-3 text-xs',
        md: 'h-10 px-4 text-sm',
        lg: 'h-12 px-6 text-base',
        icon: 'size-10',
        iconSm: 'size-8',
      },
    },
    defaultVariants: { variant: 'secondary', size: 'md' },
  },
)

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof button> {
  asChild?: boolean
}

export function Button({ className, variant, size, asChild, type = 'button', ...props }: ButtonProps) {
  const Comp = asChild ? Slot.Root : 'button'
  return <Comp type={asChild ? undefined : type} className={cn(button({ variant, size }), className)} {...props} />
}
