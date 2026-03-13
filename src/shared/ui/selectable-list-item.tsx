import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/shared/lib/classNames";

const selectableListItemVariants = cva(
  "w-full rounded-lg border text-left ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      selected: {
        true: "border-foreground/60 bg-muted/60",
        false: "border-border hover:bg-muted/40",
      },
      size: {
        default: "px-3 py-2",
        lg: "px-3 py-3",
      },
    },
    defaultVariants: {
      selected: false,
      size: "default",
    },
  },
);

type SelectableListItemProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  VariantProps<typeof selectableListItemVariants> & {
    asChild?: boolean;
  };

const SelectableListItem = React.forwardRef<HTMLButtonElement, SelectableListItemProps>(
  ({ asChild = false, className, selected, size, type, ...props }, ref) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        className={cn(selectableListItemVariants({ selected, size }), className)}
        {...(!asChild ? { type: type ?? "button" } : {})}
        {...props}
      />
    );
  },
);
SelectableListItem.displayName = "SelectableListItem";

export { SelectableListItem };
