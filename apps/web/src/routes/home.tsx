import { type FormEvent, useState } from "react";
import { ArrowRight, BarChart3, LockKeyhole, ShieldCheck, Vote } from "lucide-react";
import { Link, useNavigate } from "react-router";
import { Button, buttonVariants } from "@/components/ui/button";

export function HomeRoute() {
  const navigate = useNavigate();
  const [campaignId, setCampaignId] = useState("");

  function openCampaign(event: FormEvent) {
    event.preventDefault();
    if (campaignId.trim()) navigate(`/vote/${campaignId.trim()}`);
  }

  return (
    <div>
      <section className="hero-grid border-b border-border">
        <div className="mx-auto grid w-full max-w-7xl gap-12 px-5 py-20 sm:px-8 lg:grid-cols-[1.1fr_0.9fr] lg:items-center lg:py-28">
          <div className="max-w-3xl space-y-7">
            <div className="inline-flex items-center gap-2 rounded-full border border-primary/20 bg-primary/5 px-3 py-1.5 text-sm font-medium text-primary">
              <ShieldCheck className="h-4 w-4" aria-hidden="true" />
              Integrity-aware voting, without voter accounts
            </div>
            <div className="space-y-5">
              <h1 className="text-4xl font-semibold tracking-[-0.045em] sm:text-6xl sm:leading-[1.05]">
                A clear ballot for voters. A clear signal for organizers.
              </h1>
              <p className="max-w-2xl text-lg leading-8 text-muted-foreground">
                Run community and organization votes with verified email identity, receipts,
                explainable integrity checks, and a review trail for suspicious activity.
              </p>
            </div>
            <div className="flex flex-wrap gap-3">
              <Link to="/organizer" className={buttonVariants()}>
                Open organizer workspace <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Link>
              <a href="#find-campaign" className={buttonVariants({ variant: "outline" })}>
                I want to vote
              </a>
            </div>
          </div>

          <div id="find-campaign" className="rounded-2xl border border-border bg-white p-6 shadow-[0_24px_70px_-36px_rgba(15,70,65,0.45)] sm:p-8">
            <div className="mb-6 grid h-12 w-12 place-items-center rounded-xl bg-primary/10 text-primary">
              <Vote className="h-6 w-6" aria-hidden="true" />
            </div>
            <h2 className="text-xl font-semibold">Open a campaign</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">
              Paste the campaign ID from your invitation. You will verify your email before
              submitting a ballot.
            </p>
            <form className="mt-6 space-y-3" onSubmit={openCampaign}>
              <label className="field-label" htmlFor="campaign-id">Campaign ID</label>
              <input
                id="campaign-id"
                className="field-input font-mono text-sm"
                value={campaignId}
                onChange={(event) => setCampaignId(event.target.value)}
                placeholder="00000000-0000-4000-8000-000000000000"
                required
              />
              <Button className="w-full" type="submit">
                Continue to ballot <ArrowRight className="h-4 w-4" aria-hidden="true" />
              </Button>
            </form>
          </div>
        </div>
      </section>

      <section className="mx-auto grid w-full max-w-7xl gap-5 px-5 py-16 sm:px-8 md:grid-cols-3">
        {[
          {
            icon: LockKeyhole,
            title: "Soft identity, minimal data",
            text: "Campaign-scoped email proofs and privacy-preserving hashes help stop duplicate credentials without creating voter accounts."
          },
          {
            icon: ShieldCheck,
            title: "Explainable integrity",
            text: "Risky submissions are counted, reviewed, or blocked using visible signals—not opaque claims of perfect identity."
          },
          {
            icon: BarChart3,
            title: "Results with context",
            text: "Organizers see counted votes alongside review, duplicate, blocked, and confidence totals."
          }
        ].map(({ icon: Icon, title, text }) => (
          <article key={title} className="panel">
            <Icon className="mb-5 h-5 w-5 text-primary" aria-hidden="true" />
            <h2 className="font-semibold">{title}</h2>
            <p className="mt-2 text-sm leading-6 text-muted-foreground">{text}</p>
          </article>
        ))}
      </section>
    </div>
  );
}
