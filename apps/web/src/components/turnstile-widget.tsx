import { useEffect, useRef, useState } from "react";

const defaultTestSiteKey = "1x00000000000000000000AA";
const siteKey = import.meta.env.VITE_TURNSTILE_SITE_KEY ?? defaultTestSiteKey;
let turnstileLoader: Promise<void> | null = null;

type TurnstileWidgetProps = {
  onToken: (token: string | null) => void;
  resetKey: string;
};

export function TurnstileWidget({ onToken, resetKey }: TurnstileWidgetProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [failed, setFailed] = useState(false);

  useEffect(() => {
    let active = true;
    let widgetId: string | undefined;
    onToken(null);
    setFailed(false);

    void loadTurnstile()
      .then(() => {
        if (!active || !containerRef.current || !window.turnstile) return;
        widgetId = window.turnstile.render(containerRef.current, {
          sitekey: siteKey,
          action: "vote-submit",
          theme: "light",
          callback: (token) => onToken(token),
          "expired-callback": () => onToken(null),
          "error-callback": () => {
            onToken(null);
            setFailed(true);
          }
        });
      })
      .catch(() => {
        if (active) setFailed(true);
      });

    return () => {
      active = false;
      if (widgetId && window.turnstile) window.turnstile.remove(widgetId);
    };
  }, [onToken, resetKey]);

  return (
    <div className="space-y-2">
      <div ref={containerRef} className="min-h-[65px]" aria-label="Bot protection check" />
      {failed ? (
        <p className="text-sm text-red-700">
          The bot-protection check could not load. Check your connection and try again.
        </p>
      ) : null}
    </div>
  );
}

function loadTurnstile(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  if (turnstileLoader) return turnstileLoader;

  turnstileLoader = new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>("script[data-birdloud-turnstile]");
    if (existing) {
      existing.addEventListener("load", () => resolve(), { once: true });
      existing.addEventListener("error", () => reject(new Error("Turnstile failed to load.")), {
        once: true
      });
      return;
    }

    const script = document.createElement("script");
    script.src = "https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit";
    script.async = true;
    script.defer = true;
    script.dataset.birdloudTurnstile = "true";
    script.addEventListener("load", () => resolve(), { once: true });
    script.addEventListener("error", () => reject(new Error("Turnstile failed to load.")), {
      once: true
    });
    document.head.append(script);
  });

  return turnstileLoader;
}

declare global {
  interface Window {
    turnstile?: {
      render(
        container: HTMLElement,
        options: {
          sitekey: string;
          action: string;
          theme: "light" | "dark" | "auto";
          callback(token: string): void;
          "expired-callback"(): void;
          "error-callback"(): void;
        }
      ): string;
      remove(widgetId: string): void;
    };
  }
}
