import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { ShieldCheck, Loader2, Mail, Lock, ArrowRight } from "lucide-react";
import { z } from "zod";
import { useLanguage, tr } from "@/lib/i18n";

const loginSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/login")({
  validateSearch: (search) => loginSearchSchema.parse(search),
  component: LoginPage,
});

function LoginPage() {
  useEffect(() => {
    document.title = "Sign In — HealthGuard";
  }, []);

  const { loginWithEmail, loginWithGoogle, user, loading, syncing, hasCompletedAssessment } =
    useAuth();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const currentLang = useLanguage();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Redirect if user is already logged in
  useEffect(() => {
    if (!loading && user && hasCompletedAssessment !== null) {
      if (redirect) {
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        navigate({ to: redirect as any });
      } else if (hasCompletedAssessment === true) {
        navigate({ to: "/action-plan" });
      } else {
        navigate({ to: "/assessment" });
      }
    }
  }, [user, loading, hasCompletedAssessment, navigate, redirect]);

  const handleEmailLogin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!email || !password) return;
    setSubmitting(true);
    try {
      await loginWithEmail(email, password);
    } catch (err) {
      // toast is already handled inside AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  const handleGoogleLogin = async () => {
    setSubmitting(true);
    try {
      await loginWithGoogle();
    } catch (err) {
      // toast is already handled inside AuthContext
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="relative flex min-h-screen items-center justify-center bg-background px-4 py-12">
      <div className="absolute inset-0 bg-grid opacity-60 pointer-events-none" />
      <div className="absolute inset-x-0 top-0 h-px bg-gradient-to-r from-transparent via-teal/40 to-transparent" />

      <div className="relative z-10 w-full max-w-md">
        {/* Brand Logo Header */}
        <div className="mb-8 flex flex-col items-center text-center">
          <Link to="/" className="flex items-center gap-2.5">
            <div className="relative h-10 w-10 shrink-0 select-none glass-logo">
              <span className="glass-logo__back" />
              <span className="glass-logo__front">
                <ShieldCheck className="h-5 w-5 text-teal" strokeWidth={2.4} />
              </span>
            </div>
            <div className="text-left leading-tight">
              <div className="font-display text-xl font-bold tracking-tight text-foreground">
                HealthGuard
              </div>
              <div className="text-[10px] font-medium uppercase tracking-[0.18em] text-muted-foreground">
                AI Health Intelligence
              </div>
            </div>
          </Link>
          <h2 className="mt-6 font-display text-2xl font-bold tracking-tight text-foreground">
            {tr("welcomeBack", currentLang)}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{tr("accessPortfolio", currentLang)}</p>
        </div>

        <Card className="border-border bg-surface shadow-elevated">
          <CardHeader className="pb-4">
            <CardTitle className="font-display text-lg">{tr("signIn", currentLang)}</CardTitle>
            <CardDescription>{tr("enterCredentials", currentLang)}</CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            <form onSubmit={handleEmailLogin} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="email">{tr("emailAddress", currentLang)}</Label>
                <div className="relative">
                  <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="email"
                    type="email"
                    placeholder="you@example.com"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    required
                    className="pl-9"
                  />
                </div>
              </div>

              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label htmlFor="password">{tr("passwordLabel", currentLang)}</Label>
                  <Link
                    to="/forgot-password"
                    className="text-xs font-semibold text-teal hover:underline"
                  >
                    {tr("forgotPassword", currentLang)}
                  </Link>
                </div>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="password"
                    type="password"
                    placeholder="••••••••"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    required
                    className="pl-9"
                  />
                </div>
              </div>

              <Button
                type="submit"
                disabled={submitting || syncing}
                className="w-full bg-primary text-primary-foreground hover:bg-primary/90"
              >
                {submitting || syncing ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    {tr("signingIn", currentLang)}
                  </>
                ) : (
                  <>
                    {tr("signIn", currentLang)} <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>

            <div className="relative my-4 flex items-center justify-center">
              <span className="absolute w-full border-t border-border" />
              <span className="relative bg-surface px-3 text-xs uppercase text-muted-foreground">
                {tr("orContinueWith", currentLang)}
              </span>
            </div>

            <Button
              type="button"
              variant="outline"
              disabled={submitting || syncing}
              onClick={handleGoogleLogin}
              className="w-full gap-2 border-border bg-surface-muted hover:bg-accent/40"
            >
              <svg className="h-4 w-4 mr-1" viewBox="0 0 24 24">
                <path
                  fill="#EA4335"
                  d="M12 5.04c1.62 0 3.08.56 4.22 1.66l3.15-3.15C17.45 1.77 14.94 1 12 1 7.35 1 3.37 3.67 1.39 7.56l3.75 2.91C6.01 7.53 8.79 5.04 12 5.04z"
                />
                <path
                  fill="#4285F4"
                  d="M23.49 12.27c0-.81-.07-1.59-.2-2.36H12v4.51h6.46c-.28 1.48-1.12 2.73-2.38 3.58l3.72 2.88c2.18-2.01 3.49-4.97 3.49-8.61z"
                />
                <path
                  fill="#FBBC05"
                  d="M5.14 14.86c-.25-.76-.39-1.57-.39-2.41s.14-1.65.39-2.41L1.39 7.13C.5 8.93 0 10.91 0 13s.5 4.07 1.39 5.87l3.75-3.01z"
                />
                <path
                  fill="#34A853"
                  d="M12 23c3.24 0 5.97-1.07 7.96-2.91l-3.72-2.88c-1.1.74-2.5 1.18-4.24 1.18-3.21 0-5.99-2.49-6.86-5.43l-3.75 2.9C3.37 20.33 7.35 23 12 23z"
                />
              </svg>
              {tr("signInWithGoogle", currentLang)}
            </Button>
          </CardContent>
          <CardFooter className="justify-center border-t border-border pt-4 text-sm">
            <span className="text-muted-foreground">{tr("dontHaveAccount", currentLang)}</span>
            <Link to="/signup" className="ml-1.5 font-semibold text-teal hover:underline">
              {tr("signUpFree", currentLang)}
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
