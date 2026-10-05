/** First focusable element in the app shell: jumps keyboard users past the navigation to `<main id="main">`. */
export function SkipLink() {
  return (
    <a
      href="#main"
      className="sr-only rounded-lg bg-primary text-sm font-medium text-primary-foreground focus:not-sr-only focus:fixed focus:px-3 focus:py-2 focus:top-[max(0.5rem,env(safe-area-inset-top))] focus:left-[max(0.5rem,env(safe-area-inset-left))] focus:z-50 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-solid focus-visible:outline-ring"
    >
      Skip to content
    </a>
  );
}
