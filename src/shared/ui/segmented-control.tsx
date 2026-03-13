import * as React from "react";
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";

import { cn } from "@/shared/lib/classNames";

const segmentedControlVariants = cva("inline-flex items-center", {
  variants: {
    orientation: {
      horizontal: "flex-row",
      vertical: "flex-col",
    },
    surface: {
      compact: "rounded-lg bg-muted p-0.5 gap-0",
      filled: "rounded-lg bg-muted/60 p-1 gap-2",
      subtle: "rounded-lg bg-muted/40 p-1 gap-1",
      none: "gap-1",
    },
  },
  defaultVariants: {
    orientation: "horizontal",
    surface: "filled",
  },
});

type SegmentedControlProps = React.HTMLAttributes<HTMLDivElement> & VariantProps<typeof segmentedControlVariants>;

function SegmentedControl({ className, orientation, surface, ...props }: SegmentedControlProps) {
  return <div className={cn(segmentedControlVariants({ orientation, surface }), className)} {...props} />;
}

const segmentedControlItemVariants = cva(
  "inline-flex items-center justify-center whitespace-nowrap rounded-md font-medium ring-offset-background transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:pointer-events-none disabled:opacity-50",
  {
    variants: {
      size: {
        xs: "h-7 px-3 text-ui-xs",
        sm: "h-8 px-3 text-ui-sm",
      },
      fullWidth: {
        true: "w-full",
        false: "",
      },
    },
    defaultVariants: {
      size: "xs",
      fullWidth: false,
    },
  },
);

type SegmentedControlItemClassNameOptions = VariantProps<typeof segmentedControlItemVariants> & {
  active?: boolean;
  className?: string;
  activeClassName?: string;
  inactiveClassName?: string;
};

function getSegmentedControlItemClassName({
  active = false,
  size,
  fullWidth,
  className,
  activeClassName = "bg-foreground text-background shadow-sm",
  inactiveClassName,
}: SegmentedControlItemClassNameOptions) {
  return cn(
    segmentedControlItemVariants({ size, fullWidth }),
    active ? activeClassName : inactiveClassName,
    className,
  );
}

type SegmentedControlItemProps = React.ButtonHTMLAttributes<HTMLButtonElement> &
  Omit<SegmentedControlItemClassNameOptions, "className"> & {
    asChild?: boolean;
    className?: string;
  };

const SegmentedControlItem = React.forwardRef<HTMLButtonElement, SegmentedControlItemProps>(
  (
    {
      active,
      activeClassName,
      asChild = false,
      className,
      fullWidth,
      inactiveClassName,
      size,
      type,
      ...props
    },
    ref,
  ) => {
    const Comp = asChild ? Slot : "button";

    return (
      <Comp
        ref={ref}
        className={getSegmentedControlItemClassName({
          active,
          activeClassName,
          className,
          fullWidth,
          inactiveClassName,
          size,
        })}
        {...(!asChild ? { type: type ?? "button" } : {})}
        {...props}
      />
    );
  },
);
SegmentedControlItem.displayName = "SegmentedControlItem";

export { SegmentedControl, SegmentedControlItem };
