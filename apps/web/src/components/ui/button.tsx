import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/cn";

export const buttonVariants = cva(
  "inline-flex h-10 items-center justify-center gap-2 rounded-lg px-4 text-sm font-semibold transition-all focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      variant: {
        primary: "bg-primary text-primary-foreground hover:-translate-y-px hover:shadow-md",
        secondary: "bg-muted text-foreground hover:bg-muted/80",
        outline: "border border-border bg-white text-foreground hover:border-primary/40 hover:bg-primary/5",
        ghost: "text-muted-foreground hover:bg-muted hover:text-foreground",
        danger: "bg-red-700 text-white hover:bg-red-800"
      }
    },
    defaultVariants: {
      variant: "primary"
    }
  }
);

export type ButtonProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof buttonVariants>;

export const Button = React.forwardRef<HTMLButtonElement, ButtonProps>(
  ({ className, variant, type = "button", ...props }, ref) => (
    <button
      ref={ref}
      type={type}
      className={cn(buttonVariants({ variant, className }))}
      {...props}
    />
  )
);

Button.displayName = "Button";
