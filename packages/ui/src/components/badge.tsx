import { mergeProps } from "@base-ui/react/merge-props";
import { useRender } from "@base-ui/react/use-render";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "cn";

import { badgeBaseClass } from "./badge-styles";

const badgeVariants = cva(
  cn(
    "group/badge aria-invalid:border-destructive aria-invalid:outline-destructive",
    badgeBaseClass,
  ),
  {
    variants: {
      variant: {
        default: "border-border bg-muted text-foreground [a&]:hover:underline",
        secondary: "border-border bg-muted text-foreground/80 [a&]:hover:text-foreground",
        destructive:
          "border-destructive/25 bg-destructive-subtle text-destructive-subtle-foreground [a&]:hover:underline",
        outline: "border-border bg-transparent text-foreground [a&]:hover:bg-accent",
        ghost: "border-transparent bg-transparent text-muted-foreground hover:text-foreground",
        link: "border-transparent bg-transparent text-foreground underline-offset-4 hover:underline",
      },
    },
    defaultVariants: {
      variant: "default",
    },
  },
);

function Badge({
  className,
  variant = "default",
  render,
  ...props
}: useRender.ComponentProps<"span"> & VariantProps<typeof badgeVariants>) {
  return useRender({
    defaultTagName: "span",
    props: mergeProps<"span">(
      {
        className: cn(badgeVariants({ variant }), className),
      },
      props,
    ),
    render,
    state: {
      slot: "badge",
      variant,
    },
  });
}

export { Badge, badgeVariants };
