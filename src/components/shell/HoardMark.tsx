import { useId } from "react";
import { cn } from "@/lib/utils";

/** The Hoard logo: a tilted gold ring with a coin orbiting it. Mirrors src/app/icon.svg. */
export function HoardMark({ className }: { className?: string }) {
  // Gradient ids are document-global, so each instance needs its own.
  const gold = useId();
  return (
    <svg viewBox="0 0 32 32" aria-hidden="true" className={cn("shrink-0", className)}>
      <defs>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#fff1b0" />
          <stop offset=".35" stopColor="#f2c14e" />
          <stop offset=".7" stopColor="#b9801f" />
          <stop offset="1" stopColor="#f5d06a" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="7" fill="#12100e" />
      <path
        fill={`url(#${gold})`}
        fillRule="evenodd"
        d="M5 17a11 6.5 0 1 0 22 0a11 6.5 0 1 0-22 0ZM8 16.2a8 4.2 0 1 0 16 0a8 4.2 0 1 0-16 0Z"
      />
      <path d="M7.4 18.8A9.3 4.9 0 0 0 24.6 18.8" fill="none" stroke="#ff7a2f" strokeOpacity=".35" strokeWidth="2" />
      <path
        d="M7.4 18.8A9.3 4.9 0 0 0 24.6 18.8"
        fill="none"
        stroke="#ff4d12"
        strokeWidth=".8"
        strokeDasharray="1.6 .9"
        strokeLinecap="round"
      />
      <circle cx="24.6" cy="11.3" r="3.2" fill="#ffc457" opacity=".3" />
      <circle cx="24.6" cy="11.3" r="1.5" fill="#fffbe6" />
    </svg>
  );
}
