import type { ReactNode } from "react";
import { Capacitor } from "@capacitor/core";
import { cn } from "@/lib/utils";

/**
 * Device frame. On a real phone/emulator this is a plain full-bleed container.
 * In a desktop browser it draws a phone bezel so the layout is reviewed at the
 * size it will actually ship at, instead of stretching to a 1440px window.
 * (Ported from the ebilihan-hackathon prototype's PhoneFrame.tsx.)
 */
export function PhoneFrame({ children, className }: { children: ReactNode; className?: string }) {
  if (Capacitor.isNativePlatform()) {
    return <div className={cn("flex h-dvh flex-col bg-brand-surface", className)}>{children}</div>;
  }

  return (
    <div className="flex min-h-dvh items-center justify-center bg-neutral-900 p-0 md:p-4">
      <div
        className={cn(
          "relative flex h-dvh w-full max-w-md flex-col overflow-hidden bg-brand-surface",
          "border-0 md:h-[844px] md:rounded-[40px] md:border-8 md:border-neutral-800 md:shadow-2xl",
          className,
        )}
      >
        {children}
      </div>
    </div>
  );
}
