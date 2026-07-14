import * as React from "react";
import { ExternalLink } from "lucide-react";

import { cn } from "@/lib/utils";

/**
 * Bento-style grid container. Stacks vertically on small screens, lays out as
 * a grid from the `lg` breakpoint up. Pass `lg:grid-cols-*` / per-cell
 * `lg:col-span-*` / `lg:row-span-*` classes to shape the layout.
 *
 * Ported from Magic UI (https://magicui.design/docs/components/bento-grid).
 */
const BentoGrid = React.forwardRef<HTMLDivElement, React.ComponentProps<"div">>(
  function BentoGrid({ className, children, ...props }, ref) {
    return (
      <div
        ref={ref}
        data-slot="bento-grid"
        className={cn(
          "flex w-full flex-col gap-4 lg:grid lg:grid-cols-4",
          className
        )}
        {...props}
      >
        {children}
      </div>
    );
  }
);

interface BentoCardProps extends Omit<React.ComponentProps<"div">, "onClick"> {
  name: string;
  description?: string;
  Icon?: React.ElementType;
  /** Trailing content rendered top-right (e.g. a count Badge). */
  meta?: React.ReactNode;
  /** Called when the card is clicked. Makes the cell interactive. */
  onClick?: () => void;
  /** Show an external-link affordance next to the name. */
  external?: boolean;
}

/**
 * Bento cell. Static icon + name layout. On hover the description fades in
 * below the name while the icon scales down — nothing moves out of bounds,
 * and the description reserves its space in the DOM so there's no layout
 * shift when it appears.
 */
const BentoCard = React.forwardRef<HTMLDivElement, BentoCardProps>(
  function BentoCard(
    {
      name,
      description,
      Icon,
      meta,
      onClick,
      external = false,
      className,
      ...props
    },
    ref
  ) {
    const interactive = Boolean(onClick);
    return (
      <div
        ref={ref}
        data-slot="bento-card"
        role={interactive ? "button" : undefined}
        tabIndex={interactive ? 0 : undefined}
        className={cn(
          "group relative col-span-full flex flex-col overflow-hidden rounded-xl border bg-card p-6 text-card-foreground shadow-sm",
          interactive &&
            "cursor-pointer outline-none transition-all hover:-translate-y-0.5 hover:shadow-md focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50",
          className
        )}
        onClick={onClick}
        onKeyDown={
          interactive
            ? e => {
                if (e.key === "Enter" || e.key === " ") {
                  e.preventDefault();
                  onClick?.();
                }
              }
            : undefined
        }
        {...props}
      >
        {(Icon || meta) && (
          <div className="flex items-start justify-between">
            {Icon ? (
              <Icon className="size-10 text-primary transition-transform duration-300 ease-out group-hover:scale-90" />
            ) : (
              <span />
            )}
            {meta ?? null}
          </div>
        )}

        <div className="mt-auto">
          {description ? (
            <p className="mb-2 translate-y-1 text-sm text-muted-foreground opacity-0 transition-all duration-300 group-hover:translate-y-0 group-hover:opacity-100">
              {description}
            </p>
          ) : null}
          <h3 className="flex items-center gap-1.5 text-lg font-semibold leading-none">
            {name}
            {external ? (
              <ExternalLink className="size-3.5 text-muted-foreground" />
            ) : null}
          </h3>
        </div>
      </div>
    );
  }
);

export { BentoGrid, BentoCard, type BentoCardProps };
