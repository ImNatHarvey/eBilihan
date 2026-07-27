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

const statToneClass = {
  neutral: "text-brand-ink",
  positive: "text-green-700",
  negative: "text-brand-red",
  warning: "text-yellow-700",
} as const;

/** Compact KPI tile — Home dashboard, Products, Wallet summary. */
function StatTile({
  label,
  value,
  hint,
  tone = "neutral",
  icon,
}: {
  label: string;
  value: string;
  hint?: string;
  tone?: keyof typeof statToneClass;
  icon?: React.ReactNode;
}) {
  return (
    <div className="rounded-2xl border border-brand-ink/10 bg-white p-3 shadow-sm">
      <div className="flex items-center justify-between">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-ink/50">{label}</p>
        {icon}
      </div>
      <p className={cn("mt-1 text-lg font-black tabular-nums", statToneClass[tone])}>{value}</p>
      {hint && <p className="mt-0.5 text-[10px] text-brand-ink/40">{hint}</p>}
    </div>
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, StatTile };
