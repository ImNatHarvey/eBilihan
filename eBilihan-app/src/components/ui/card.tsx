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

/**
 * The four "secondary colors" from eBilihanReference/eGov Light Colors.png — used as
 * full-card backgrounds (not just a small icon badge) across Home, Products, and Wallet.
 */
const statTone = {
  blue: { bg: "bg-brand-blue-light", iconText: "text-brand-blue" },
  green: { bg: "bg-brand-gold-light", iconText: "text-green-700" },
  red: { bg: "bg-brand-red-light", iconText: "text-brand-red" },
  neutral: { bg: "bg-brand-surface", iconText: "text-brand-ink/60" },
} as const;

/**
 * Highlighted KPI tile — the tone color fills the whole card (not just the icon), text
 * stays neutral black/brand-ink throughout (color is for the card + icon accent only,
 * not the numbers), and the icon sits to the right of the label/value, larger, in a
 * soft white circle. Used across Home, Products, and Wallet's summary rows.
 *
 * Fixed `min-h` so every tile is the same size everywhere — some stats have a `hint`
 * line and some don't, which (without a fixed height) made cards with a hint render
 * taller than ones without, both within a single grid row and page-to-page.
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
    <div className={cn("flex min-h-[88px] items-center justify-between gap-2 rounded-2xl p-3 shadow-sm", t.bg)}>
      <div className="min-w-0">
        <p className="text-[10px] font-semibold uppercase tracking-wide text-brand-ink/60">{label}</p>
        <p className="mt-1 text-lg font-bold tabular-nums text-brand-ink">{value}</p>
        {hint && <p className="mt-0.5 text-[10px] text-brand-ink/50">{hint}</p>}
      </div>
      {icon && (
        <span className={cn("flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-white shadow-md [&>svg]:h-5 [&>svg]:w-5", t.iconText)}>
          {icon}
        </span>
      )}
    </div>
  );
}

export { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter, StatTile };
