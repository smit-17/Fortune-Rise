import { createFileRoute, useNavigate } from "@tanstack/react-router";
import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { supabase } from "@/integrations/supabase/client";
import lepdoaccountlogo from "@/assets/lepdoaccountlogo.png";

export const Route = createFileRoute("/reset-password")({
  ssr: false,
  head: () => ({
    meta: [
      { title: "Set a new password — LEPDO Accounting" },
      {
        name: "description",
        content: "Choose a new password for your LEPDO Accounting account.",
      },
      { property: "og:title", content: "Set a new password — LEPDO Accounting" },
      {
        property: "og:description",
        content: "Choose a new password for your LEPDO Accounting account.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: ResetPasswordPage,
});

function ResetPasswordPage() {
  const navigate = useNavigate();
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (password.length < 8) {
      setError("Use at least 8 characters.");
      return;
    }
    if (password !== confirm) {
      setError("The two passwords do not match.");
      return;
    }
    setBusy(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    if (updateError) {
      setBusy(false);
      setError(updateError.message);
      return;
    }
    const { data } = await supabase.auth.getUser();
    if (data.user) {
      await supabase
        .from("profiles")
        .update({ must_change_password: false })
        .eq("id", data.user.id);
      await supabase.from("security_audit_log").insert({
        actor_id: data.user.id,
        actor_email: data.user.email ?? null,
        action: "user.password_reset_completed",
        result: "success",
      });
    }
    setBusy(false);
    setDone(true);
  };

  return (
    <div className="flex min-h-[70vh] items-center justify-center px-4">
      <div className="w-full max-w-[400px] rounded-2xl border border-border bg-card p-6 shadow-lg">
        <div className="mb-5 flex items-center justify-center rounded-xl bg-navy px-4 py-3">
          <img src={lepdoaccountlogo} alt="LEPDO" className="h-8 w-auto object-contain" />
        </div>
        <h1 className="text-lg font-semibold text-navy">Set a new password</h1>
        {done ? (
          <div className="mt-4 space-y-3">
            <p className="text-sm text-muted-foreground">
              Your password has been updated. You can now continue to the app.
            </p>
            <Button className="h-9 w-full" onClick={() => void navigate({ to: "/" })}>
              Continue
            </Button>
          </div>
        ) : (
          <form onSubmit={submit} className="mt-4 space-y-3">
            <div className="space-y-1.5">
              <Label className="text-xs">New password</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
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
              {busy ? "Saving…" : "Save password"}
            </Button>
          </form>
        )}
      </div>
    </div>
  );
}
