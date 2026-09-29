import { cn } from "@/lib/utils";

export function NativeSelect({ className, ...props }) {
  return (
    <select
      className={cn(
        "h-11 w-full rounded-md border border-input bg-background px-3 text-base text-foreground shadow-xs",
        "focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/40 focus-visible:outline-none",
        "aria-invalid:border-destructive disabled:opacity-50",
        className,
      )}
      {...props}
    />
  );
}
