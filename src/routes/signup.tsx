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
import { ShieldCheck, Loader2, Mail, Lock, User, ArrowRight } from "lucide-react";
import { toast } from "sonner";
import { useLanguage, tr } from "@/lib/i18n";

import { z } from "zod";

const signupSearchSchema = z.object({
  redirect: z.string().optional(),
});

export const Route = createFileRoute("/signup")({
  validateSearch: (search) => signupSearchSchema.parse(search),
  component: SignupPage,
});

function SignupPage() {
  useEffect(() => {
    document.title = "Create Account — HealthGuard";
  }, []);

  const { signUpWithEmail, user, loading, syncing, hasCompletedAssessment } = useAuth();
  const { redirect } = Route.useSearch();
  const navigate = useNavigate();
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);

  // Redirect if user is already logged in
  const currentLang = useLanguage();
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

  const handleSignup = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || !email || !password) return;

    if (password.length < 6) {
      toast.error("Password must be at least 6 characters long.");
      return;
    }

    if (password !== confirmPassword) {
      toast.error("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    try {
      await signUpWithEmail(email, password, name);
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
            {tr("createAccount", currentLang)}
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">{tr("startTracking", currentLang)}</p>
        </div>

        <Card className="border-border bg-surface shadow-elevated">
          <CardHeader className="pb-4">
            <CardTitle className="font-display text-lg">{tr("signUp", currentLang)}</CardTitle>
            <CardDescription>{tr("enterDetailsSignUp", currentLang)}</CardDescription>
          </CardHeader>
          <CardContent>
            <form onSubmit={handleSignup} className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="name">{tr("fullName", currentLang)}</Label>
                <div className="relative">
                  <User className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="name"
                    type="text"
                    placeholder="John Doe"
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    required
                    className="pl-9"
                  />
                </div>
              </div>

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
                <Label htmlFor="password">{tr("passwordLabel", currentLang)}</Label>
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

              <div className="space-y-2">
                <Label htmlFor="confirmPassword">{tr("confirmPassword", currentLang)}</Label>
                <div className="relative">
                  <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                  <Input
                    id="confirmPassword"
                    type="password"
                    placeholder="••••••••"
                    value={confirmPassword}
                    onChange={(e) => setConfirmPassword(e.target.value)}
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
                    {tr("creatingAccount", currentLang)}
                  </>
                ) : (
                  <>
                    {tr("signUpFree", currentLang)} <ArrowRight className="ml-2 h-4 w-4" />
                  </>
                )}
              </Button>
            </form>
          </CardContent>
          <CardFooter className="justify-center border-t border-border pt-4 text-sm">
            <span className="text-muted-foreground">{tr("alreadyHaveAccount", currentLang)}</span>
            <Link to="/login" className="ml-1.5 font-semibold text-teal hover:underline">
              {tr("signIn", currentLang)}
            </Link>
          </CardFooter>
        </Card>
      </div>
    </div>
  );
}
