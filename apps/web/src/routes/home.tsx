import { ShieldCheck } from "lucide-react";
import { Button } from "@/components/ui/button";

export function HomeRoute() {
  return (
    <section className="mx-auto flex min-h-screen w-full max-w-5xl flex-col justify-center gap-8 px-6 py-12">
      <div className="max-w-3xl space-y-5">
        <div className="inline-flex items-center gap-2 rounded-md border border-border px-3 py-2 text-sm text-muted-foreground">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" />
          BirdLoud V1 foundation
        </div>
        <div className="space-y-4">
          <h1 className="text-4xl font-semibold tracking-normal sm:text-5xl">
            Fast voting for normal voters. Visible friction for attackers.
          </h1>
          <p className="max-w-2xl text-base leading-7 text-muted-foreground">
            This scaffold is ready for the API-first voting flow: soft identity,
            idempotency, integrity checks, review queues, and clear results.
          </p>
        </div>
        <div className="flex flex-wrap gap-3">
          <Button type="button">Open organizer workspace</Button>
          <Button type="button" variant="secondary">
            View campaign
          </Button>
        </div>
      </div>
    </section>
  );
}
