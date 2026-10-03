import { useState, type ReactNode } from "react";
import { Loader2, LockKeyhole, ShieldAlert } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import lepdoaccountlogo from "@/assets/lepdoaccountlogo.png";
import { useAuth } from "@/lib/auth/auth";
import { changeOwnPassword, sendPasswordReset } from "@/lib/auth/adminApi";

function Frame({
  title,
  subtitle,
  children,
}: {
  title: string;
  subtitle?: string;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/40 px-4 py-10">
      <div className="w-full max-w-[400px] rounded-2xl border border-border bg-card p-6 shadow-lg">
        <div className="mb-5 flex items-center justify-center rounded-xl bg-navy px-4 py-3">
          <img src={lepdoaccountlogo} alt="LEPDO" className="h-8 w-auto object-contain" />
        </div>
        <h1 className="text-lg font-semibold text-navy">{title}</h1>
        {subtitle ? <p className="mt-1 text-xs text-muted-foreground">{subtitle}</p> : null}
        <div className="mt-4">{children}</div>
      </div>
    </div>
  );
}

function LoginScreen() {
  const { signIn, notice, clearNotice } = useAuth();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [resetSent, setResetSent] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    clearNotice();
    setBusy(true);
    const res = await signIn(email, password);
    setBusy(false);
    if (!res.ok) setError(res.message ?? "Invalid email or password.");
  };

  const forgot = async () => {
    if (!email.trim()) {
      setError("Enter your email address first.");
      return;
    }
    try {
      await sendPasswordReset(email.trim().toLowerCase());
      setResetSent(true);
      setError(null);
    } catch {
      setResetSent(true);
    }
  };

  return (
    <Frame title="Sign in to LEPDO Accounting" subtitle="Use the email and password given to you.">
      {notice ? (
        <p className="mb-3 flex items-start gap-2 rounded-md border border-gold/40 bg-gold-tint px-3 py-2 text-xs text-navy">
          <ShieldAlert className="mt-0.5 size-3.5 shrink-0" /> {notice}
        </p>
      ) : null}
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label htmlFor="email" className="text-xs">
            Email
          </Label>
          <Input
            id="email"
            type="email"
            autoComplete="username"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            required
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="password" className="text-xs">
            Password
          </Label>
          <Input
            id="password"
            type="password"
            autoComplete="current-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            className="h-9"
          />
        </div>
        {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
        {resetSent ? (
          <p className="text-xs text-muted-foreground">
            If that email belongs to an account, a reset link is on its way.
          </p>
        ) : null}
        <Button type="submit" className="h-9 w-full" disabled={busy}>
          {busy ? <Loader2 className="size-4 animate-spin" /> : <LockKeyhole className="size-4" />}
          {busy ? "Signing in…" : "Sign in"}
        </Button>
        <button
          type="button"
          onClick={forgot}
          className="w-full text-center text-[11px] text-muted-foreground underline-offset-2 hover:underline"
        >
          Forgot password?
        </button>
      </form>
    </Frame>
  );
}

function ForcePasswordChange() {
  const { profile, refreshProfile, signOut } = useAuth();
  const [current, setCurrent] = useState("");
  const [next, setNext] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (next.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (next !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    try {
      await changeOwnPassword(current, next);
      await refreshProfile();
    } catch (err) {
      setError(err instanceof Error ? err.message : "The password could not be changed.");
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame
      title="Set a new password"
      subtitle={`${profile?.email ?? ""} — you must change your password before continuing.`}
    >
      <form onSubmit={submit} className="space-y-3">
        <div className="space-y-1.5">
          <Label className="text-xs">Current password</Label>
          <Input
            type="password"
            autoComplete="current-password"
            value={current}
            onChange={(e) => setCurrent(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">New password</Label>
          <Input
            type="password"
            autoComplete="new-password"
            value={next}
            onChange={(e) => setNext(e.target.value)}
            className="h-9"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs">Confirm new password</Label>
          <Input
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            className="h-9"
          />
        </div>
        {error ? <p className="text-xs font-medium text-destructive">{error}</p> : null}
        <Button type="submit" className="h-9 w-full" disabled={busy}>
          {busy ? "Saving…" : "Save password & continue"}
        </Button>
        <button
          type="button"
          onClick={() => void signOut()}
          className="w-full text-center text-[11px] text-muted-foreground underline-offset-2 hover:underline"
        >
          Sign out
        </button>
      </form>
    </Frame>
  );
}

export function AuthGate({ children }: { children: ReactNode }) {
  const { loading, session, profile } = useAuth();

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-muted/40">
        <Loader2 className="size-6 animate-spin text-navy" />
      </div>
    );
  }
  if (!session || !profile) return <LoginScreen />;
  if (profile.must_change_password) return <ForcePasswordChange />;
  return <>{children}</>;
}

export function AccessDenied({ what = "this page" }: { what?: string }) {
  return (
    <div className="mx-auto max-w-md rounded-xl border border-border bg-card p-6 text-center">
      <ShieldAlert className="mx-auto size-7 text-gold" />
      <h2 className="mt-3 text-base font-semibold text-navy">You don't have access to {what}</h2>
      <p className="mt-1 text-xs text-muted-foreground">
        Ask an administrator to give you permission for this section.
      </p>
    </div>
  );
}
