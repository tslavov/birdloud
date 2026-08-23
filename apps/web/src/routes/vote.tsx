import { type FormEvent, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { CheckCircle2, LockKeyhole, Mail, Send, ShieldCheck } from "lucide-react";
import { Link, useNavigate, useParams, useSearchParams } from "react-router";
import { ErrorNotice, LoadingState, Panel, StatusBadge, formatDate } from "@/components/shared";
import { TurnstileWidget } from "@/components/turnstile-widget";
import { Button } from "@/components/ui/button";
import { api, errorMessage, type PublicCampaign } from "@/lib/api";
import {
  claimIdempotency,
  getOrCreateDeviceId,
  getStoredProof,
  removeProof,
  storeProof,
  type IdempotencyClaim,
  type StoredProof
} from "@/lib/voter-session";

export function VoteRoute() {
  const { campaignId = "" } = useParams();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();
  const verificationToken = searchParams.get("token");
  const [campaign, setCampaign] = useState<PublicCampaign | null>(null);
  const [proof, setProof] = useState<StoredProof | null>(() => getStoredProof(sessionStorage, campaignId));
  const [selectedOption, setSelectedOption] = useState("");
  const [inviteToken, setInviteToken] = useState(searchParams.get("invite") ?? "");
  const [botToken, setBotToken] = useState<string | null>(null);
  const [turnstileResetKey, setTurnstileResetKey] = useState(() => crypto.randomUUID());
  const [verificationSent, setVerificationSent] = useState(false);
  const [verifying, setVerifying] = useState(Boolean(verificationToken));
  const [pending, setPending] = useState(false);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const idempotency = useRef<IdempotencyClaim | null>(null);

  const handleBotToken = useCallback((token: string | null) => {
    setBotToken(token);
  }, []);

  useEffect(() => {
    let active = true;
    setLoading(true);
    api
      .getPublicCampaign(campaignId)
      .then((nextCampaign) => {
        if (active) setCampaign(nextCampaign);
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
  }, [campaignId]);

  useEffect(() => {
    if (!verificationToken) return;
    let active = true;
    setVerifying(true);
    setError(null);
    api
      .verifyEmail(campaignId, verificationToken)
      .then((verified) => {
        if (!active) return;
        const nextProof = { proof: verified.identityProof, expiresAt: verified.expiresAt };
        storeProof(sessionStorage, campaignId, nextProof);
        setProof(nextProof);
      })
      .catch((caught) => {
        if (active) setError(errorMessage(caught));
      })
      .finally(() => {
        if (active) setVerifying(false);
      });
    return () => {
      active = false;
    };
  }, [campaignId, verificationToken]);

  const proofIsValid = useMemo(
    () => Boolean(proof && new Date(proof.expiresAt).getTime() > Date.now()),
    [proof]
  );

  async function requestVerification(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setVerificationSent(false);
    const form = new FormData(event.currentTarget);
    try {
      await api.requestEmailVerification(campaignId, String(form.get("email") ?? ""));
      setVerificationSent(true);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  async function submitVote(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!proof || !proofIsValid || !selectedOption || !botToken) return;
    setPending(true);
    setError(null);

    const trimmedInvite = inviteToken.trim();
    const fingerprint = JSON.stringify({
      optionId: selectedOption,
      identityProof: proof.proof,
      inviteToken: trimmedInvite || null
    });
    idempotency.current = claimIdempotency(idempotency.current, fingerprint);

    try {
      const response = await api.submitVote(campaignId, {
        optionId: selectedOption,
        idempotencyKey: idempotency.current.key,
        identity: { provider: "email", proof: proof.proof },
        botProtectionToken: botToken,
        deviceId: getOrCreateDeviceId(localStorage),
        ...(trimmedInvite ? { inviteToken: trimmedInvite } : {})
      });
      removeProof(sessionStorage, campaignId);
      navigate(`/vote/${campaignId}/receipt/${encodeURIComponent(response.receipt)}`, {
        state: response
      });
    } catch (caught) {
      setError(errorMessage(caught));
      setTurnstileResetKey(crypto.randomUUID());
    } finally {
      setPending(false);
    }
  }

  if (loading || verifying) {
    return (
      <div className="page-container max-w-3xl">
        <LoadingState label={verifying ? "Verifying your email" : "Loading ballot"} />
      </div>
    );
  }

  if (!campaign) {
    return <div className="page-container max-w-3xl">{error ? <ErrorNotice message={error} /> : null}</div>;
  }

  const canVote = campaign.status === "active";

  return (
    <div className="page-container max-w-3xl space-y-6">
      <div className="space-y-4 text-center">
        <div className="flex justify-center"><StatusBadge status={campaign.status} /></div>
        <h1 className="text-3xl font-semibold tracking-[-0.03em] sm:text-4xl">{campaign.title}</h1>
        <p className="mx-auto max-w-2xl text-base leading-7 text-muted-foreground">
          {campaign.description || "Review the choices below and submit one vote."}
        </p>
        <p className="text-sm text-muted-foreground">
          {formatDate(campaign.startsAt)} – {formatDate(campaign.endsAt)}
        </p>
      </div>

      {error ? <ErrorNotice message={error} /> : null}

      {!canVote ? (
        <Panel>
          <div className="py-6 text-center">
            <LockKeyhole className="mx-auto h-8 w-8 text-muted-foreground" aria-hidden="true" />
            <h2 className="mt-3 text-lg font-semibold">
              {campaign.status === "closed" ? "Voting is closed" : "Voting has not opened"}
            </h2>
            <p className="mt-2 text-sm text-muted-foreground">
              Contact the organizer if you believe this campaign should be available.
            </p>
          </div>
        </Panel>
      ) : !proofIsValid ? (
        <Panel title="Verify your email" description="We will send a one-time link that returns you to this ballot.">
          <form className="space-y-4" onSubmit={requestVerification}>
            <label className="field-label">
              Email address
              <input className="field-input" name="email" type="email" autoComplete="email" required maxLength={320} />
            </label>
            <Button className="w-full sm:w-auto" type="submit" disabled={pending}>
              <Mail className="h-4 w-4" aria-hidden="true" />
              {pending ? "Sending…" : "Send verification link"}
            </Button>
          </form>
          {verificationSent ? (
            <div className="mt-5 flex gap-3 rounded-xl border border-emerald-200 bg-emerald-50 p-4 text-sm text-emerald-900">
              <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0" aria-hidden="true" />
              <p>Check your inbox. The link is one-time and expires shortly.</p>
            </div>
          ) : null}
        </Panel>
      ) : (
        <form className="space-y-6" onSubmit={submitVote}>
          <Panel title="Choose one option" description="Your receipt will confirm recording without revealing this selection.">
            <fieldset className="space-y-3">
              <legend className="sr-only">Ballot choices</legend>
              {campaign.options.map((option) => (
                <label
                  key={option.id}
                  className={`block cursor-pointer rounded-xl border p-4 transition ${
                    selectedOption === option.id
                      ? "border-primary bg-primary/5 ring-1 ring-primary"
                      : "border-border bg-white hover:border-primary/40"
                  }`}
                >
                  <span className="flex items-start gap-3">
                    <input
                      className="mt-1"
                      type="radio"
                      name="option"
                      value={option.id}
                      checked={selectedOption === option.id}
                      onChange={() => setSelectedOption(option.id)}
                      required
                    />
                    <span>
                      <strong className="block">{option.label}</strong>
                      {option.description ? (
                        <span className="mt-1 block text-sm leading-6 text-muted-foreground">{option.description}</span>
                      ) : null}
                    </span>
                  </span>
                </label>
              ))}
            </fieldset>
            {campaign.options.length === 0 ? (
              <p className="text-sm text-red-700">This campaign has no available choices. Contact the organizer.</p>
            ) : null}
          </Panel>

          <Panel title="Optional invite token" description="Use the single-use token supplied by the organizer, if you received one.">
            <label className="field-label">
              Invite token
              <input
                className="field-input font-mono"
                value={inviteToken}
                onChange={(event) => setInviteToken(event.target.value)}
                minLength={8}
                autoComplete="off"
              />
            </label>
          </Panel>

          <Panel title="Bot protection" description="This lightweight check helps rate-limit automated mass voting.">
            <TurnstileWidget onToken={handleBotToken} resetKey={turnstileResetKey} />
          </Panel>

          <div className="rounded-xl border border-border bg-muted/50 p-4 text-sm leading-6 text-muted-foreground">
            <div className="flex gap-3">
              <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
              <p>
                BirdLoud limits duplicate credentials and records integrity signals. Email verification
                does not prove that one credential equals one unique real-world person.
              </p>
            </div>
          </div>

          <Button className="h-12 w-full text-base" type="submit" disabled={pending || !selectedOption || !botToken || campaign.options.length === 0}>
            <Send className="h-4 w-4" aria-hidden="true" />
            {pending ? "Submitting securely…" : "Submit vote"}
          </Button>
        </form>
      )}

      <p className="text-center text-xs text-muted-foreground">
        Need to start over? <Link className="font-medium text-primary hover:underline" to="/">Return home</Link>
      </p>
    </div>
  );
}
