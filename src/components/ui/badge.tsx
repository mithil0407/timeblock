import * as React from "react";
import { cva, type VariantProps } from "class-variance-authority";
import { cn } from "@/lib/utils";

const badgeVariants = cva(
    "inline-flex items-center rounded-full border px-2.5 py-0.5 text-xs font-semibold transition-colors focus:outline-none focus:ring-2 focus:ring-ring focus:ring-offset-2",
    {
        variants: {
            variant: {
                default:
                    "border-transparent bg-primary text-primary-foreground hover:bg-primary/80",
                secondary:
                    "border-transparent bg-secondary text-secondary-foreground hover:bg-secondary/80",
                destructive:
                    "border-transparent bg-destructive text-destructive-foreground hover:bg-destructive/80",
                outline: "text-foreground",
                // Priority badges
                priority1: "border-transparent bg-priority-1 text-gray-700",
                priority2: "border-transparent bg-priority-2 text-blue-800",
                priority3: "border-transparent bg-priority-3 text-yellow-800",
                priority4: "border-transparent bg-priority-4 text-orange-800",
                priority5: "border-transparent bg-priority-5 text-red-800",
                // Status badges
                scheduled: "border-transparent bg-status-scheduled text-white",
                inProgress: "border-transparent bg-status-in-progress text-white",
                completed: "border-transparent bg-status-completed text-white",
                // Energy badges
                energyHigh: "border-transparent bg-energy-high text-green-800",
                energyMedium: "border-transparent bg-energy-medium text-yellow-800",
                energyLow: "border-transparent bg-energy-low text-red-800",
            },
        },
        defaultVariants: {
            variant: "default",
        },
    }
);

export interface BadgeProps
    extends React.HTMLAttributes<HTMLDivElement>,
    VariantProps<typeof badgeVariants> { }

function Badge({ className, variant, ...props }: BadgeProps) {
    return (
        <div className={cn(badgeVariants({ variant }), className)} {...props} />
    );
}

export { Badge, badgeVariants };
