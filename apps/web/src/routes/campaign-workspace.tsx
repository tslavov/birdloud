import { type FormEvent, useCallback, useEffect, useState } from "react";
import {
  ArrowLeft,
  Check,
  CircleStop,
  Copy,
  Download,
  KeyRound,
  Play,
  Plus,
  Trash2,
  X
} from "lucide-react";
import { Link, Navigate, useParams } from "react-router";
import {
  EmptyState,
  ErrorNotice,
  LoadingState,
  PageIntro,
  Panel,
  StatusBadge,
  copyText,
  formatDate
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  api,
  errorMessage,
  type Campaign,
  type CampaignIntegrity,
  type CampaignResults,
  type PublicCampaign,
  type ReviewVote
} from "@/lib/api";
import { useOrganizerSession } from "@/lib/use-organizer-session";

type TokenSummary = { active: number; used: number; revoked: number; expired: number };
type IssuedToken = { id: string; token: string };

export function CampaignWorkspaceRoute() {
  const { campaignId = "" } = useParams();
  const session = useOrganizerSession();
  const [campaign, setCampaign] = useState<Campaign | null>(null);
  const [publicCampaign, setPublicCampaign] = useState<PublicCampaign | null>(null);
  const [tokenSummary, setTokenSummary] = useState<TokenSummary | null>(null);
  const [reviewVotes, setReviewVotes] = useState<ReviewVote[]>([]);
  const [results, setResults] = useState<CampaignResults | null>(null);
  const [integrity, setIntegrity] = useState<CampaignIntegrity | null>(null);
  const [issuedTokens, setIssuedTokens] = useState<IssuedToken[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    if (!session.session || !campaignId) return;
    setLoading(true);
    setError(null);
    try {
      const [nextCampaign, nextPublic, nextTokens, nextReview, nextResults, nextIntegrity] =
        await Promise.all([
          api.getCampaign(campaignId),
          api.getPublicCampaign(campaignId),
          api.getTokenSummary(campaignId),
          api.listReviewVotes(campaignId),
          api.getCampaignResults(campaignId),
          api.getCampaignIntegrity(campaignId)
        ]);
      setCampaign(nextCampaign);
      setPublicCampaign(nextPublic);
      setTokenSummary(nextTokens);
      setReviewVotes(nextReview);
      setResults(nextResults);
      setIntegrity(nextIntegrity);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, [campaignId, session.session]);

  useEffect(() => {
    void load();
  }, [load]);

  if (session.loading) {
    return <div className="page-container"><LoadingState label="Checking organizer session" /></div>;
  }

  if (!session.session) {
    return <Navigate to="/organizer" replace />;
  }

  if (loading && !campaign) {
    return <div className="page-container"><LoadingState label="Loading campaign workspace" /></div>;
  }

  async function run(action: () => Promise<unknown>, after = load) {
    setPending(true);
    setError(null);
    try {
      await action();
      await after();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function changeStatus(status: "activate" | "close") {
    await run(async () => {
      setCampaign(await api.setCampaignStatus(campaignId, status));
    });
  }

  async function createOption(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const formElement = event.currentTarget;
    const form = new FormData(formElement);
    const description = optionalValue(form, "description");
    await run(
      () =>
        api.createOption(campaignId, {
          label: String(form.get("label") ?? ""),
          position: Number(form.get("position") ?? 0),
          ...(description ? { description } : {})
        }),
      async () => {
        formElement.reset();
        await load();
      }
    );
  }

  async function issueTokens(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const issuedLabel = optionalValue(form, "issuedLabel");
    await run(
      async () => {
        const response = await api.issueTokens(campaignId, {
          count: Number(form.get("count") ?? 1),
          ...(issuedLabel ? { issuedLabel } : {})
        });
        setIssuedTokens(response.tokens);
      },
      async () => {
        setTokenSummary(await api.getTokenSummary(campaignId));
      }
    );
  }

  async function resolveVote(voteId: string, decision: "approve" | "reject") {
    await run(() => api.resolveReviewVote(campaignId, voteId, decision));
  }

  async function download(format: "json" | "csv") {
    await run(
      async () => {
        const exported = await api.downloadCampaignExport(campaignId, format);
        const url = URL.createObjectURL(exported.blob);
        const anchor = document.createElement("a");
        anchor.href = url;
        anchor.download = exported.filename;
        anchor.click();
        URL.revokeObjectURL(url);
      },
      async () => undefined
    );
  }

  const publicUrl = `${window.location.origin}/vote/${campaignId}`;

  return (
    <div className="page-container space-y-8">
      <Link
        className="inline-flex items-center gap-2 text-sm font-medium text-muted-foreground hover:text-foreground"
        to={campaign ? `/organizer/elections/${campaign.electionId}` : "/organizer"}
      >
        <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to election
      </Link>

      {campaign ? (
        <PageIntro
          eyebrow="Campaign workspace"
          title={campaign.title}
          description={campaign.description || "Configure the ballot, distribute the voter link, and review integrity context."}
          actions={
            <>
              {campaign.status === "draft" ? (
                <Button disabled={pending} onClick={() => void changeStatus("activate")}>
                  <Play className="h-4 w-4" aria-hidden="true" /> Activate
                </Button>
              ) : null}
              {campaign.status === "active" ? (
                <Button variant="danger" disabled={pending} onClick={() => void changeStatus("close")}>
                  <CircleStop className="h-4 w-4" aria-hidden="true" /> Close voting
                </Button>
              ) : null}
              <StatusBadge status={campaign.status} />
            </>
          }
        />
      ) : null}

      {error ? <ErrorNotice message={error} /> : null}

      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Counted votes" value={results?.countedVotes ?? 0} />
        <Metric label="Under review" value={results?.underReviewVotes ?? 0} />
        <Metric label="Duplicate attempts" value={results?.duplicateAttempts ?? 0} />
        <Metric label="Integrity score" value={integrity ? `${integrity.integrityScore}/100` : "—"} />
      </div>

      <div className="grid gap-6 xl:grid-cols-[1.15fr_0.85fr] xl:items-start">
        <div className="space-y-6">
          <Panel title="Ballot choices" description="Only active choices appear to voters. Configure choices before campaign activation.">
            {publicCampaign?.options.length ? (
              <div className="space-y-3">
                {publicCampaign.options.map((option) => (
                  <OptionEditor
                    key={option.id}
                    campaignId={campaignId}
                    option={option}
                    disabled={pending || campaign?.status !== "draft"}
                    onChanged={load}
                    onError={setError}
                    onPending={setPending}
                  />
                ))}
              </div>
            ) : (
              <EmptyState title="No ballot choices" description="Add at least one choice before sharing this campaign." />
            )}

            {campaign?.status === "draft" ? (
              <form className="mt-5 grid gap-3 rounded-xl bg-muted/60 p-4 sm:grid-cols-[1fr_1fr_90px_auto]" onSubmit={createOption}>
                <label className="field-label">
                  Label
                  <input className="field-input" name="label" required maxLength={160} />
                </label>
                <label className="field-label">
                  Description
                  <input className="field-input" name="description" maxLength={1000} />
                </label>
                <label className="field-label">
                  Position
                  <input className="field-input" name="position" type="number" min={0} defaultValue={publicCampaign?.options.length ?? 0} required />
                </label>
                <Button className="self-end" type="submit" disabled={pending}>
                  <Plus className="h-4 w-4" aria-hidden="true" /> Add
                </Button>
              </form>
            ) : null}
          </Panel>

          <Panel title="Review queue" description="Suspicious submissions wait here until an organizer explicitly approves or rejects them.">
            {reviewVotes.length === 0 ? (
              <EmptyState title="Review queue is clear" description="No votes currently require a decision." />
            ) : (
              <div className="divide-y divide-border">
                {reviewVotes.map((vote) => (
                  <article key={vote.id} className="flex flex-col gap-4 py-4 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                    <div>
                      <div className="flex flex-wrap items-center gap-2">
                        <StatusBadge status={vote.confidenceLevel} />
                        <span className="text-sm font-semibold">Risk {vote.riskScore}/100</span>
                      </div>
                      <p className="mt-2 text-sm text-muted-foreground">{vote.reviewReason || "Risk policy threshold reached"}</p>
                      <p className="mt-1 font-mono text-xs text-muted-foreground">Vote {vote.id}</p>
                    </div>
                    <div className="flex gap-2">
                      <Button variant="outline" disabled={pending} onClick={() => void resolveVote(vote.id, "approve")}>
                        <Check className="h-4 w-4" aria-hidden="true" /> Approve
                      </Button>
                      <Button variant="danger" disabled={pending} onClick={() => void resolveVote(vote.id, "reject")}>
                        <X className="h-4 w-4" aria-hidden="true" /> Reject
                      </Button>
                    </div>
                  </article>
                ))}
              </div>
            )}
          </Panel>

          <Panel title="Results and integrity" description="Raw totals are paired with confidence, review, duplicate, and blocking context.">
            <div className="overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="border-b border-border text-xs uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="pb-3 font-semibold">Choice</th>
                    <th className="pb-3 font-semibold">Counted</th>
                    <th className="pb-3 font-semibold">Delayed</th>
                    <th className="pb-3 font-semibold">Review</th>
                    <th className="pb-3 font-semibold">Rejected</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {results?.options.map((option) => (
                    <tr key={option.optionId}>
                      <td className="py-3 font-medium">{option.label}</td>
                      <td className="py-3">{option.countedVotes}</td>
                      <td className="py-3">{option.delayedVotes}</td>
                      <td className="py-3">{option.underReviewVotes}</td>
                      <td className="py-3">{option.rejectedVotes}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
            {integrity?.signals.length ? (
              <div className="mt-5 grid gap-3 sm:grid-cols-2">
                {integrity.signals.map((signal) => (
                  <div key={signal.code} className="rounded-xl border border-border p-4">
                    <div className="flex items-center justify-between gap-3">
                      <span className="font-medium">{signal.label}</span>
                      <StatusBadge status={signal.severity} />
                    </div>
                    <p className="mt-2 text-2xl font-semibold">{signal.value}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="mt-5 text-sm text-muted-foreground">No elevated integrity signals are currently reported.</p>
            )}
            <div className="mt-5 flex flex-wrap gap-2">
              <Button variant="outline" disabled={pending} onClick={() => void download("json")}>
                <Download className="h-4 w-4" aria-hidden="true" /> JSON report
              </Button>
              <Button variant="outline" disabled={pending} onClick={() => void download("csv")}>
                <Download className="h-4 w-4" aria-hidden="true" /> CSV results
              </Button>
            </div>
          </Panel>
        </div>

        <div className="space-y-6">
          <Panel title="Voter link" description="Share this URL once the campaign is active.">
            <div className="break-all rounded-lg bg-muted p-3 font-mono text-xs">{publicUrl}</div>
            <div className="mt-4 flex flex-wrap gap-2">
              <Button variant="outline" onClick={() => void copyText(publicUrl)}>
                <Copy className="h-4 w-4" aria-hidden="true" /> Copy link
              </Button>
              <Link className="inline-flex h-10 items-center justify-center rounded-lg px-4 text-sm font-semibold text-primary hover:bg-primary/5" to={`/vote/${campaignId}`}>
                Preview ballot
              </Link>
            </div>
            <dl className="mt-5 grid grid-cols-2 gap-4 border-t border-border pt-5 text-sm">
              <div><dt className="text-muted-foreground">Starts</dt><dd className="mt-1 font-medium">{formatDate(campaign?.startsAt ?? null)}</dd></div>
              <div><dt className="text-muted-foreground">Ends</dt><dd className="mt-1 font-medium">{formatDate(campaign?.endsAt ?? null)}</dd></div>
              <div><dt className="text-muted-foreground">Identity</dt><dd className="mt-1 font-medium">{campaign?.identityMode.replaceAll("_", " ")}</dd></div>
              <div><dt className="text-muted-foreground">Review</dt><dd className="mt-1 font-medium">{campaign?.allowReviewQueue ? "Enabled" : "Disabled"}</dd></div>
            </dl>
          </Panel>

          <Panel title="Invite tokens" description="Optional single-use credentials add confidence; they do not prove a unique real person.">
            <div className="mb-5 grid grid-cols-4 gap-2 text-center">
              <TokenMetric label="Active" value={tokenSummary?.active ?? 0} />
              <TokenMetric label="Used" value={tokenSummary?.used ?? 0} />
              <TokenMetric label="Revoked" value={tokenSummary?.revoked ?? 0} />
              <TokenMetric label="Expired" value={tokenSummary?.expired ?? 0} />
            </div>
            <form className="grid gap-3 sm:grid-cols-[90px_1fr_auto]" onSubmit={issueTokens}>
              <label className="field-label">
                Count
                <input className="field-input" name="count" type="number" min={1} max={500} defaultValue={10} required />
              </label>
              <label className="field-label">
                Private label
                <input className="field-input" name="issuedLabel" maxLength={160} placeholder="August member list" />
              </label>
              <Button className="self-end" type="submit" disabled={pending}>
                <KeyRound className="h-4 w-4" aria-hidden="true" /> Issue
              </Button>
            </form>
            {issuedTokens.length ? (
              <div className="mt-5 rounded-xl border border-amber-200 bg-amber-50 p-4">
                <p className="font-semibold text-amber-950">Save these tokens now</p>
                <p className="mt-1 text-sm text-amber-900">Plaintext is shown once and cannot be recovered later.</p>
                <textarea
                  className="field-textarea mt-3 min-h-36 font-mono text-xs"
                  readOnly
                  value={issuedTokens.map((item) => item.token).join("\n")}
                />
                <Button className="mt-3" variant="outline" onClick={() => void copyText(issuedTokens.map((item) => item.token).join("\n"))}>
                  <Copy className="h-4 w-4" aria-hidden="true" /> Copy tokens
                </Button>
              </div>
            ) : null}
          </Panel>
        </div>
      </div>
    </div>
  );
}

function OptionEditor({
  campaignId,
  option,
  disabled,
  onChanged,
  onError,
  onPending
}: {
  campaignId: string;
  option: PublicCampaign["options"][number];
  disabled: boolean;
  onChanged: () => Promise<void>;
  onError: (message: string | null) => void;
  onPending: (value: boolean) => void;
}) {
  async function update(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const description = optionalValue(form, "description");
    onPending(true);
    onError(null);
    try {
      await api.updateOption(campaignId, option.id, {
        label: String(form.get("label") ?? ""),
        position: Number(form.get("position") ?? 0),
        ...(description ? { description } : {})
      });
      await onChanged();
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      onPending(false);
    }
  }

  async function remove() {
    if (!window.confirm(`Delete "${option.label}" from the ballot?`)) return;
    onPending(true);
    onError(null);
    try {
      await api.deleteOption(campaignId, option.id);
      await onChanged();
    } catch (caught) {
      onError(errorMessage(caught));
    } finally {
      onPending(false);
    }
  }

  return (
    <form className="grid gap-3 rounded-xl border border-border p-4 sm:grid-cols-[1fr_1fr_80px_auto]" onSubmit={update}>
      <label className="field-label">
        Label
        <input className="field-input" name="label" defaultValue={option.label} required maxLength={160} disabled={disabled} />
      </label>
      <label className="field-label">
        Description
        <input className="field-input" name="description" defaultValue={option.description ?? ""} maxLength={1000} disabled={disabled} />
      </label>
      <label className="field-label">
        Position
        <input className="field-input" name="position" type="number" min={0} defaultValue={option.position} required disabled={disabled} />
      </label>
      <div className="flex items-end gap-1">
        <Button variant="outline" type="submit" disabled={disabled}>Save</Button>
        <Button variant="ghost" aria-label={`Delete ${option.label}`} disabled={disabled} onClick={() => void remove()}>
          <Trash2 className="h-4 w-4 text-red-700" aria-hidden="true" />
        </Button>
      </div>
    </form>
  );
}

function Metric({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="rounded-2xl border border-border bg-white p-5 shadow-sm">
      <p className="text-sm text-muted-foreground">{label}</p>
      <p className="mt-2 text-3xl font-semibold tracking-tight">{value}</p>
    </div>
  );
}

function TokenMetric({ label, value }: { label: string; value: number }) {
  return <div><p className="text-xl font-semibold">{value}</p><p className="text-[11px] text-muted-foreground">{label}</p></div>;
}

function optionalValue(form: FormData, key: string): string | undefined {
  const value = String(form.get(key) ?? "").trim();
  return value || undefined;
}
