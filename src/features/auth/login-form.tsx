"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Eye, EyeOff, Loader2, LogIn } from "lucide-react";
import { BrandLockup } from "@/components/layout/brand";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useDatabase, useHydrated, useSignedInUser } from "@/hooks/use-data";
import { DEFAULT_PASSWORD } from "@/lib/auth/accounts";
import { ROLE_LABELS } from "@/lib/auth/permissions";
import { signIn } from "@/lib/repositories";

export function LoginForm() {
  const router = useRouter();
  const db = useDatabase();
  const hydrated = useHydrated();
  const signedIn = useSignedInUser();
  const [id, setId] = useState("");
  const [password, setPassword] = useState("");
  const [show, setShow] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  useEffect(() => {
    if (signedIn) router.replace("/");
  }, [signedIn, router]);

  const submit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    const res = await signIn(id, password);
    setBusy(false);
    if (!res.ok) return setError(res.error);
    router.replace("/");
  };

  // A few accounts of different roles, to make the demo easy to try.
  const samples = ["USR-01", "USR-02", "USR-03", "USR-05", "USR-07", "USR-06"].map((uid) => db.users.find((u) => u.id === uid)).filter(Boolean) as typeof db.users;

  return (
    <div className="flex min-h-screen items-center justify-center bg-muted/30 px-4 py-10">
      <div className="w-full max-w-md space-y-5">
        <div className="flex justify-center">
          <BrandLockup />
        </div>
        <form onSubmit={submit} className="card-elevated space-y-4 p-6">
          <div>
            <h1 className="text-lg font-semibold">Sign in</h1>
            <p className="mt-0.5 text-sm text-muted-foreground">Use your Employee ID or email. You will see only what your role allows.</p>
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="login-id">Employee ID or email</Label>
            <Input id="login-id" autoComplete="username" autoFocus value={id} onChange={(e) => setId(e.target.value)} placeholder="EMP-1009 or 2011-256" required />
          </div>
          <div className="space-y-1.5">
            <Label htmlFor="login-pw">Password</Label>
            <div className="relative">
              <Input id="login-pw" type={show ? "text" : "password"} autoComplete="current-password" value={password} onChange={(e) => setPassword(e.target.value)} className="pr-10" required />
              <button type="button" onClick={() => setShow((s) => !s)} className="absolute right-2 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground" aria-label={show ? "Hide password" : "Show password"}>
                {show ? <EyeOff className="size-4" /> : <Eye className="size-4" />}
              </button>
            </div>
          </div>
          {error ? (
            <p role="alert" className="text-sm text-destructive">
              {error}
            </p>
          ) : null}
          <Button type="submit" className="w-full" disabled={busy || !hydrated}>
            {busy ? <Loader2 className="animate-spin" /> : <LogIn />} Sign in
          </Button>
        </form>

        <div className="rounded-lg border border-dashed bg-card/60 p-4 text-xs text-muted-foreground">
          <p className="font-medium text-foreground">Demo build</p>
          <p className="mt-1">
            Every employee has an account. The first password is <span className="font-mono font-semibold text-foreground">{DEFAULT_PASSWORD}</span>. This is a browser-only demo, not real security.
          </p>
          {hydrated ? (
            <ul className="mt-3 grid gap-1.5 sm:grid-cols-2">
              {samples.map((u) => (
                <li key={u.id}>
                  <button
                    type="button"
                    onClick={() => {
                      setId(u.employeeId ?? u.email);
                      setPassword(DEFAULT_PASSWORD);
                      setError("");
                    }}
                    className="w-full rounded-md border bg-background px-2.5 py-1.5 text-left hover:bg-accent"
                  >
                    <div className="truncate font-medium text-foreground">{ROLE_LABELS[u.role]}</div>
                    <div className="truncate">{u.name}</div>
                  </button>
                </li>
              ))}
            </ul>
          ) : null}
        </div>
      </div>
    </div>
  );
}
