import { type FormEvent, useCallback, useEffect, useState } from "react";
import { ArrowRight, CalendarPlus, LogOut, ShieldCheck, UserPlus } from "lucide-react";
import { Link } from "react-router";
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
import { api, errorMessage, type Election, type OrganizerSession } from "@/lib/api";
import { useOrganizerSession } from "@/lib/use-organizer-session";

export function OrganizerRoute() {
  const sessionState = useOrganizerSession();

  if (sessionState.loading) {
    return <div className="page-container"><LoadingState label="Checking organizer session" /></div>;
  }

  if (!sessionState.session) {
    return (
      <OrganizerAuth
        initialError={sessionState.error}
        onAuthenticated={() => sessionState.refresh()}
      />
    );
  }

  return (
    <OrganizerWorkspace
      session={sessionState.session}
      onSignOut={async () => {
        await api.signOut();
        sessionState.setSession(null);
      }}
    />
  );
}

function OrganizerAuth({
  initialError,
  onAuthenticated
}: {
  initialError: string | null;
  onAuthenticated: () => Promise<void>;
}) {
  const [mode, setMode] = useState<"sign-in" | "sign-up">("sign-in");
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(initialError);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      const email = String(form.get("email") ?? "");
      const password = String(form.get("password") ?? "");
      if (mode === "sign-up") {
        await api.signUp({
          name: String(form.get("name") ?? ""),
          email,
          password
        });
      } else {
        await api.signIn({ email, password });
      }
      await onAuthenticated();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setPending(false);
    }
  }

  return (
    <div className="page-container grid gap-8 lg:grid-cols-[0.85fr_1.15fr] lg:items-center">
      <div className="space-y-5">
        <p className="eyebrow">Organizer access</p>
        <h1 className="text-4xl font-semibold tracking-[-0.04em]">Run the vote, see the integrity context.</h1>
        <p className="text-base leading-7 text-muted-foreground">
          Create campaigns, issue optional invite tokens, resolve suspicious votes, and publish
          results backed by a durable audit trail.
        </p>
        <div className="flex gap-3 rounded-xl border border-border bg-white p-4 text-sm leading-6 text-muted-foreground">
          <ShieldCheck className="mt-0.5 h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
          Organizer routes use a secure Better Auth session. Voters never need a BirdLoud account.
        </div>
      </div>

      <Panel
        title={mode === "sign-in" ? "Sign in" : "Create organizer account"}
        description={
          mode === "sign-in"
            ? "Continue to your elections and campaigns."
            : "Create a local organizer account for this BirdLoud deployment."
        }
        className="mx-auto w-full max-w-lg"
      >
        <form className="space-y-4" onSubmit={submit}>
          {mode === "sign-up" ? (
            <label className="field-label">
              Name
              <input className="field-input" name="name" autoComplete="name" required maxLength={160} />
            </label>
          ) : null}
          <label className="field-label">
            Email
            <input className="field-input" name="email" type="email" autoComplete="email" required />
          </label>
          <label className="field-label">
            Password
            <input
              className="field-input"
              name="password"
              type="password"
              autoComplete={mode === "sign-in" ? "current-password" : "new-password"}
              minLength={8}
              required
            />
          </label>
          {error ? <ErrorNotice message={error} /> : null}
          <Button className="w-full" type="submit" disabled={pending}>
            {mode === "sign-in" ? <ShieldCheck className="h-4 w-4" /> : <UserPlus className="h-4 w-4" />}
            {pending ? "Please wait…" : mode === "sign-in" ? "Sign in" : "Create account"}
          </Button>
        </form>
        <button
          className="mt-5 w-full text-center text-sm font-medium text-primary hover:underline"
          type="button"
          onClick={() => {
            setMode(mode === "sign-in" ? "sign-up" : "sign-in");
            setError(null);
          }}
        >
          {mode === "sign-in" ? "Need an organizer account?" : "Already have an account?"}
        </button>
      </Panel>
    </div>
  );
}

function OrganizerWorkspace({
  session,
  onSignOut
}: {
  session: OrganizerSession;
  onSignOut: () => Promise<void>;
}) {
  const [elections, setElections] = useState<Election[]>([]);
  const [loading, setLoading] = useState(true);
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      setElections(await api.listElections());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  async function createElection(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    const form = new FormData(event.currentTarget);

    try {
      const description = optionalValue(form, "description");
      const startsAt = toApiDateTime(String(form.get("startsAt") ?? ""));
      const endsAt = toApiDateTime(String(form.get("endsAt") ?? ""));
      await api.createElection({
        title: String(form.get("title") ?? ""),
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

  return (
    <div className="page-container space-y-8">
      <PageIntro
        eyebrow="Organizer workspace"
        title={`Welcome, ${session.user.name || session.user.email}`}
        description="Create an election, configure its campaigns, then monitor review and result signals from one workspace."
        actions={
          <Button variant="outline" onClick={() => void onSignOut()}>
            <LogOut className="h-4 w-4" aria-hidden="true" /> Sign out
          </Button>
        }
      />

      {error ? <ErrorNotice message={error} /> : null}

      <div className="grid gap-6 lg:grid-cols-[1fr_360px] lg:items-start">
        <Panel title="Your elections" description="Open an election to create and configure campaigns.">
          {loading ? (
            <LoadingState label="Loading elections" />
          ) : elections.length === 0 ? (
            <EmptyState title="No elections yet" description="Create your first election using the form beside this list." />
          ) : (
            <div className="divide-y divide-border">
              {elections.map((election) => (
                <article key={election.id} className="flex flex-col gap-4 py-5 first:pt-0 last:pb-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <h2 className="truncate font-semibold">{election.title}</h2>
                      <StatusBadge status={election.status} />
                    </div>
                    <p className="line-clamp-2 text-sm text-muted-foreground">
                      {election.description || "No description"}
                    </p>
                    <p className="mt-2 text-xs text-muted-foreground">Starts {formatDate(election.startsAt)}</p>
                  </div>
                  <Link className={buttonVariants({ variant: "outline" })} to={`/organizer/elections/${election.id}`}>
                    Manage <ArrowRight className="h-4 w-4" aria-hidden="true" />
                  </Link>
                </article>
              ))}
            </div>
          )}
        </Panel>

        <Panel title="Create election" description="Start in draft, then add one or more campaigns.">
          <form className="space-y-4" onSubmit={createElection}>
            <label className="field-label">
              Title
              <input className="field-input" name="title" required maxLength={160} placeholder="Community board election" />
            </label>
            <label className="field-label">
              Description
              <textarea className="field-textarea" name="description" maxLength={2000} placeholder="What voters are deciding" />
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
            <Button className="w-full" type="submit" disabled={pending}>
              <CalendarPlus className="h-4 w-4" aria-hidden="true" />
              {pending ? "Creating…" : "Create election"}
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
