import * as React from "react";
import { cn } from "@/lib/utils";

function Card({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return (
    <div
      className={cn(
        "rounded-xl border border-brand-ink/10 bg-white shadow-sm",
        className,
      )}
      {...props}
    />
  );
}

function CardHeader({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex flex-col gap-1 p-4", className)} {...props} />;
}

function CardTitle({ className, ...props }: React.HTMLAttributes<HTMLHeadingElement>) {
  return <h3 className={cn("text-base font-semibold text-brand-ink", className)} {...props} />;
}

function CardDescription({ className, ...props }: React.HTMLAttributes<HTMLParagraphElement>) {
  return <p className={cn("text-sm text-brand-ink/60", className)} {...props} />;
}

function CardContent({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("p-4 pt-0", className)} {...props} />;
}

function CardFooter({ className, ...props }: React.HTMLAttributes<HTMLDivElement>) {
  return <div className={cn("flex items-center p-4 pt-0", className)} {...props} />;
}

const statTone = {
  blue: { bg: "bg-blue-50", text: "text-blue-700", iconBg: "bg-blue-100" },
  green: { bg: "bg-green-50", text: "text-green-700", iconBg: "bg-green-100" },
  yellow: { bg: "bg-amber-50", text: "text-amber-700", iconBg: "bg-amber-100" },
  red: { bg: "bg-red-50", text: "text-brand-red", iconBg: "bg-red-100" },
} as const;

/**
 * Highlighted KPI tile — soft tinted background + icon-in-circle, used across Home and
 * Products so the summary cards read as distinct at a glance instead of a wall of
 * identical white boxes.
 */
function StatTile({
  label,
  value,
  hint,
  tone = "blue",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: keyof typeof statTone;
  icon?: React.ReactNode;
}) {
  const t = statTone[tone];
  return (
    <div className={cn("rounded-2xl p-3 shadow-sm", t.bg)}>
      <div className="flex items-center justify-between">
        {icon && <span className={cn("flex h-7 w-7 items-center justify-center rounded-full", t.iconBg, t.text)}>{icon}</span>}
      </div>
      <p className={cn("mt-2 text-lg font-black tabular-nums", t.text)}>{value}</p>
      <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-ink/50">{label}</p>
      {hint && <p className="mt-0.5 text-[10px] text-brand-ink/40">{hint}</p>}
    </div>
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, StatTile };
