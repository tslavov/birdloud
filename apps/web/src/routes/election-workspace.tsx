import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowLeft, ArrowRight, Archive, CalendarPlus, CircleStop, Play } from "lucide-react";
import { Link, Navigate, useParams } from "react-router";
import {
  EmptyState,
  ErrorNotice,
  LoadingState,
  PageIntro,
  Panel,
  StatusBadge,
  formatDate,
  toApiDateTime
} from "@/components/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { api, errorMessage, type Campaign, type Election } from "@/lib/api";
import { useOrganizerSession } from "@/lib/use-organizer-session";

export function ElectionWorkspaceRoute() {
  const { electionId = "" } = useParams();
  const session = useOrganizerSession();
  const [election, setElection] = useState<Election | null>(null);
  const [campaigns, setCampaigns] = useState<Campaign[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session.session || !electionId) return;
    setLoading(true);
    setError(null);
    try {
      const [nextElection, nextCampaigns] = await Promise.all([
        api.getElection(electionId),
        api.listCampaigns(electionId)
      ]);
      setElection(nextElection);
      setCampaigns(nextCampaigns);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [electionId, session.session]);

  useEffect(() => {
    void load();
  }, [load]);

  if (session.loading) {
    return <div className="page-container"><LoadingState label="Checking organizer session" /></div>;
  }

  if (!session.session) {
    return <Navigate to="/organizer" replace />;
  }

  async function changeStatus(status: "activate" | "close" | "archive") {
    setPending(true);
    setError(null);
    try {
      setElection(await api.setElectionStatus(electionId, status));
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function createCampaign(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);
    const description = optionalValue(form, "description");
    const startsAt = toApiDateTime(String(form.get("startsAt") ?? ""));
    const endsAt = toApiDateTime(String(form.get("endsAt") ?? ""));

    try {
      await api.createCampaign(electionId, {
        title: String(form.get("title") ?? ""),
        identityMode: String(form.get("identityMode")) as Campaign["identityMode"],
        allowReviewQueue: form.get("allowReviewQueue") === "on",
        duplicateIdentityPolicy: String(
          form.get("duplicateIdentityPolicy")
        ) as Campaign["duplicateIdentityPolicy"],
        ...(description ? { description } : {}),
        ...(startsAt ? { startsAt } : {}),
        ...(endsAt ? { endsAt } : {})
      });
      event.currentTarget.reset();
      await load();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  if (loading && !election) {
    return <div className="page-container"><LoadingState label="Loading election" /></div>;
  }

  return (
    <div className="page-container space-y-8">
      <Link className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground" to="/organizer">
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> All elections
      </Link>

      {election ? (
        <PageIntro
          eyebrow="Election"
          title={election.title}
          description={election.description || "Configure campaigns and control this election's lifecycle."}
          actions={
            <>
              {election.status === "draft" ? (
                <Button disabled={pending} onClick={() => void changeStatus("activate")}>
                  <Play className="h-4 w-4" aria-hidden="true" /> Activate
                </Button>
              ) : null}
              {election.status === "active" ? (
                <Button variant="danger" disabled={pending} onClick={() => void changeStatus("close")}>
                  <CircleStop className="h-4 w-4" aria-hidden="true" /> Close
                </Button>
              ) : null}
              {election.status === "closed" ? (
                <Button variant="outline" disabled={pending} onClick={() => void changeStatus("archive")}>
                  <Archive className="h-4 w-4" aria-hidden="true" /> Archive
                </Button>
              ) : null}
              <StatusBadge status={election.status} />
            </>
          }
        />
      ) : null}

      {error ? <ErrorNotice message={error} /> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_380px] lg:items-start">
        <Panel title="Campaigns" description="Each campaign is a separate ballot with its own identity and integrity policy.">
          {campaigns.length === 0 ? (
            <EmptyState title="No campaigns yet" description="Create a campaign, then add ballot choices before activation." />
          ) : (
            <div className="divide-y divide-border">
              {campaigns.map((campaign) => (
                <article key={campaign.id} className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h2 className="font-semibold">{campaign.title}</h2>
                      <StatusBadge status={campaign.status} />
                    </div>
                    <p className="text-sm leading-6 text-muted-foreground">
                      {campaign.description || "No description"} · {campaign.identityMode.replaceAll("_", " ")}
                    </p>
                    <p className="mt-1 text-xs text-muted-foreground">Starts {formatDate(campaign.startsAt)}</p>
                  </div>
                  <Link className={buttonVariants({ variant: "outline" })} to={`/organizer/campaigns/${campaign.id}`}>
                    Manage <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </article>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Create campaign" description="New campaigns remain draft until you activate them.">
          <form className="space-y-4" onSubmit={createCampaign}>
            <label className="field-label">
              Title
              <input className="field-input" name="title" required maxLength={160} placeholder="Board representative" />
            </label>
            <label className="field-label">
              Description
              <textarea className="field-textarea" name="description" maxLength={2000} />
            </label>
            <label className="field-label">
              Identity mode
              <select className="field-input" name="identityMode" defaultValue="soft_identity">
                <option value="soft_identity">Verified email</option>
                <option value="invite_token_optional">Verified email + optional invite token</option>
              </select>
            </label>
            <label className="field-label">
              Duplicate identity policy
              <select className="field-input" name="duplicateIdentityPolicy" defaultValue="review">
                <option value="review">Send to review</option>
                <option value="block">Block</option>
                <option value="count_with_risk">Count with risk</option>
              </select>
            </label>
            <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-1">
              <label className="field-label">
                Starts
                <input className="field-input" name="startsAt" type="datetime-local" />
              </label>
              <label className="field-label">
                Ends
                <input className="field-input" name="endsAt" type="datetime-local" />
              </label>
            </div>
            <label className="flex items-start gap-3 text-sm">
              <input className="mt-1" name="allowReviewQueue" type="checkbox" defaultChecked />
              <span>
                <strong className="block">Enable review queue</strong>
                <span className="text-muted-foreground">Hold suspicious votes for an organizer decision.</span>
              </span>
            </label>
            <Button className="w-full" type="submit" disabled={pending}>
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              {pending ? "Creating…" : "Create campaign"}
            </Button>
          </form>
        </Panel>
      </div>
    </div>
  );
}

function optionalValue(form: FormData, key: string): string | undefined {
  const value = String(form.get(key) ?? "").trim();
  return value || undefined;
}
