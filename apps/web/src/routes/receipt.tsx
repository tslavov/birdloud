import { useEffect, useState } from "react";
import { CheckCircle2, Copy, EyeOff, ShieldCheck } from "lucide-react";
import { Link, useLocation, useParams } from "react-router";
import { ErrorNotice, LoadingState, Panel, StatusBadge, copyText, formatDate } from "@/components/shared";
import { Button, buttonVariants } from "@/components/ui/button";
import { api, errorMessage, type ReceiptStatus, type VoteResponse } from "@/lib/api";

export function ReceiptRoute() {
  const { campaignId = "", receipt = "" } = useParams();
  const location = useLocation();
  const submitted = isVoteResponse(location.state) ? location.state : null;
  const [status, setStatus] = useState<ReceiptStatus | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    setLoading(true);
    setError(null);
    api
      .verifyReceipt(campaignId, receipt)
      .then((nextStatus) => {
        if (active) setStatus(nextStatus);
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      })
      .finally(() => {
        if (active) setLoading(false);
      });
    return () => {
      active = false;
    };
  }, [campaignId, receipt]);

  return (
    <div className="page-container max-w-2xl space-y-6">
      <div className="text-center">
        <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-emerald-100 text-emerald-800">
          <CheckCircle2 className="h-7 w-7" aria-hidden="true" />
        </div>
        <p className="eyebrow mt-5">Vote receipt</p>
        <h1 className="mt-2 text-3xl font-semibold tracking-[-0.03em]">Your submission was recorded</h1>
        <p className="mt-3 text-base leading-7 text-muted-foreground">
          Keep this receipt to verify that BirdLoud still recognizes the submission.
        </p>
      </div>

      {loading ? <LoadingState label="Verifying receipt" /> : null}
      {error ? <ErrorNotice message={error} /> : null}

      {status ? (
        <Panel>
          <div className="flex flex-col gap-5 sm:flex-row sm:items-start sm:justify-between">
            <div>
              <p className="text-sm text-muted-foreground">Current vote status</p>
              <div className="mt-2"><StatusBadge status={status.voteStatus} /></div>
            </div>
            <div className="sm:text-right">
              <p className="text-sm text-muted-foreground">Recorded</p>
              <p className="mt-2 font-medium">{formatDate(status.recordedAt)}</p>
            </div>
          </div>
          {submitted ? <p className="mt-5 border-t border-border pt-5 text-sm text-muted-foreground">{submitted.message}</p> : null}
          <div className="mt-5 rounded-xl bg-muted p-4">
            <p className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">Receipt</p>
            <p className="mt-2 break-all font-mono text-sm">{receipt}</p>
          </div>
          <Button className="mt-4" variant="outline" onClick={() => void copyText(receipt)}>
            <Copy className="h-4 w-4" aria-hidden="true" /> Copy receipt
          </Button>
        </Panel>
      ) : null}

      <div className="flex gap-3 rounded-xl border border-border bg-white p-4 text-sm leading-6 text-muted-foreground">
        <EyeOff className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
        <p>
          Receipt verification intentionally never reveals the selected choice. It only confirms
          that the receipt exists, its current status, and when it was recorded.
        </p>
      </div>

      <div className="flex flex-wrap justify-center gap-3">
        <Link className={buttonVariants({ variant: "outline" })} to={`/vote/${campaignId}`}>
          Return to campaign
        </Link>
        <Link className={buttonVariants()} to="/">
          <ShieldCheck className="h-4 w-4" aria-hidden="true" /> BirdLoud home
        </Link>
      </div>
    </div>
  );
}

function isVoteResponse(value: unknown): value is VoteResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    "receipt" in value &&
    typeof (value as { receipt?: unknown }).receipt === "string"
  );
}
