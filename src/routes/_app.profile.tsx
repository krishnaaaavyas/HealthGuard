import { createFileRoute, Link, useNavigate } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { useLanguage, tr } from "@/lib/i18n";
import { useAuth } from "@/contexts/auth-context";
import { Button } from "@/components/ui/button";
import { Card, CardContent } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback, AvatarImage } from "@/components/ui/avatar";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
  DialogClose,
} from "@/components/ui/dialog";
import {
  Loader2,
  LogOut,
  ShieldCheck,
  CheckCircle2,
  Clock,
  LayoutDashboard,
  FileDown,
  UploadCloud,
  Settings,
  Pencil,
  Globe,
  Bell,
  Trash2,
  ArrowRight,
  ShieldAlert,
} from "lucide-react";
import { auth } from "@/lib/firebase";
import { updateProfile } from "firebase/auth";
import { toast } from "sonner";
import { useTheme } from "@/contexts/theme-context";
import { LanguageSwitcher } from "@/components/language-switcher";
import { ShapeGrid } from "@/components/ui/shape-grid";


export const Route = createFileRoute("/_app/profile")({
  component: ProfilePage,
});

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:5000";

function ProfilePage() {
  const currentLang = useLanguage();
  const { user, logout } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [assessmentStatus, setAssessmentStatus] = useState<{
    hasCompletedAssessment: boolean;
    lastAssessmentUpdate: string | null;
    hasBloodReport?: boolean;
    bloodReportDate?: string | null;
  } | null>(null);
  const [loadingStatus, setLoadingStatus] = useState(true);

  // Edit Name dialog state
  const [editName, setEditName] = useState(user?.displayName || "");
  const [savingName, setSavingName] = useState(false);
  const [editDialogOpen, setEditDialogOpen] = useState(false);

  // Settings states
  const [notificationsEnabled, setNotificationsEnabled] = useState(true);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  useEffect(() => {
    document.title = `${tr("profile", currentLang)} — HealthGuard`;
    if (typeof window !== "undefined" && window.location.search.includes("settings=true")) {
      setSettingsOpen(true);
    }
  }, [currentLang]);

  useEffect(() => {
    const fetchStatus = async () => {
      try {
        let idToken = "mock-uid-guest";
        if (auth.currentUser) {
          idToken = await auth.currentUser.getIdToken();
        }
        const res = await fetch(`${API_URL}/api/user/status`, {
          headers: { Authorization: `Bearer ${idToken}` },
        });
        if (res.ok) {
          const data = await res.json();
          setAssessmentStatus(data);
        }
      } catch (err) {
        console.error("Failed to fetch assessment status in profile:", err);
      } finally {
        setLoadingStatus(false);
      }
    };
    fetchStatus();
  }, []);

  const formatDate = (dateStr: string | null | undefined) => {
    if (!dateStr) return "—";
    const d = new Date(dateStr);
    return d.toLocaleDateString(undefined, {
      day: "2-digit",
      month: "short",
    });
  };

  const handleUpdateName = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!auth.currentUser || !editName.trim()) return;

    setSavingName(true);
    try {
      await updateProfile(auth.currentUser, {
        displayName: editName.trim(),
      });
      toast.success("Name updated successfully!");
      setEditDialogOpen(false);
      // Reload page to reflect user object changes
      window.location.reload();
    } catch (error) {
      console.error(error);
      toast.error("Failed to update profile name.");
    } finally {
      setSavingName(false);
    }
  };

  if (!user) {
    return (
      <div className="flex h-screen items-center justify-center bg-background">
        <Loader2 className="h-8 w-8 animate-spin text-teal" />
      </div>
    );
  }

  const isGoogle = user.providerData.some((p) => p.providerId === "google.com");
  const hasCompleted = assessmentStatus?.hasCompletedAssessment ?? false;
  const hasBloodReport = assessmentStatus?.hasBloodReport ?? false;

  const initials = user?.displayName
    ? user.displayName.split(" ").map((n) => n[0]).join("").toUpperCase()
    : user.email?.slice(0, 2).toUpperCase() || "PT";

  return (
    <div className="relative w-full min-h-[calc(100vh-3.5rem)] overflow-hidden flex flex-col justify-start isolate">
      {/* Background Grid */}
      <div className="absolute inset-0 -z-10 opacity-70">
        <ShapeGrid
          speed={0.2}
          squareSize={40}
          direction="diagonal"
          borderColor="rgba(20, 184, 166, 0.08)"
          hoverFillColor="rgba(20, 184, 166, 0.15)"
          shape="square"
          hoverTrailAmount={4}
        />
      </div>

      <div className="mx-auto max-w-7xl px-4 sm:px-6 py-6 lg:py-8 w-full space-y-6">
        <div className="space-y-6">
        {/* Header */}
        <div className="text-center space-y-1">
          <h1 className="font-display text-2xl font-bold uppercase tracking-widest text-foreground">
            {tr("profile", currentLang)}
          </h1>
          <p className="text-xs text-muted-foreground">
            {tr("manageAccountAndProfile", currentLang)}
          </p>
        </div>

        {/* User Card */}
        <Card className="border-border/60 bg-surface/50 shadow-card-soft overflow-hidden backdrop-blur-sm">
          <CardContent className="p-5 flex items-center justify-between gap-4">
            <div className="flex items-center gap-4">
              <Avatar className="h-14 w-14 border border-border/60 shadow-sm shrink-0">
                <AvatarImage
                  src={
                    user.providerData.find((p) => p.providerId === "google.com")?.photoURL ||
                    user.photoURL ||
                    undefined
                  }
                  alt={user.displayName || "User"}
                />
                <AvatarFallback className="bg-teal/10 text-teal text-lg font-bold">
                  {initials}
                </AvatarFallback>
              </Avatar>

              <div className="space-y-0.5">
                <h2 className="font-display text-base font-bold text-foreground leading-tight">
                  {user.displayName || tr("patient", currentLang)}
                </h2>
                <p className="text-xs text-muted-foreground">{user.email}</p>
                <div className="pt-1 flex items-center gap-1.5">
                  <Badge
                    variant="outline"
                    className="bg-background text-muted-foreground border-border/40 font-medium text-[10px] py-0.5 px-2 rounded-full"
                  >
                    <ShieldCheck className="h-3 w-3 mr-1 inline-block text-teal" />
                    {isGoogle ? "Google Account" : "Email Account"}
                  </Badge>
                </div>
              </div>
            </div>

            {/* Edit Profile Button Modal */}
            <Dialog open={editDialogOpen} onOpenChange={setEditDialogOpen}>
              <DialogTrigger asChild>
                <Button
                  variant="outline"
                  size="sm"
                  className="h-8 gap-1.5 text-xs border-border/60 hover:bg-accent/40 font-semibold rounded-lg shrink-0 cursor-pointer"
                >
                  <Pencil className="h-3 w-3" /> {tr("editProfile", currentLang)}
                </Button>
              </DialogTrigger>
              <DialogContent className="sm:max-w-md border-border bg-surface">
                <DialogHeader>
                  <DialogTitle className="text-base font-bold">{tr("editProfileDetails", currentLang)}</DialogTitle>
                </DialogHeader>
                <form onSubmit={handleUpdateName} className="space-y-4 pt-2">
                  <div className="space-y-1.5">
                    <label className="text-xs font-semibold text-muted-foreground">{tr("fullName", currentLang)}</label>
                    <input
                      type="text"
                      value={editName}
                      onChange={(e) => setEditName(e.target.value)}
                      placeholder="Krish Savaliya"
                      className="w-full rounded-lg border border-border bg-background px-3 py-2 text-sm focus:border-teal focus:outline-none focus:ring-1 focus:ring-teal"
                      disabled={savingName}
                      required
                    />
                  </div>
                  <div className="flex justify-end gap-2 pt-2">
                    <DialogClose asChild>
                      <Button variant="outline" size="sm" type="button" className="h-9 text-xs">
                        {tr("cancel", currentLang)}
                      </Button>
                    </DialogClose>
                    <Button
                      size="sm"
                      type="submit"
                      className="bg-teal text-white hover:bg-teal/90 h-9 text-xs font-semibold"
                      disabled={savingName || !editName.trim()}
                    >
                      {savingName ? (
                        <Loader2 className="h-3 w-3 animate-spin mr-1" />
                      ) : null}
                      {tr("saveChanges", currentLang)}
                    </Button>
                  </div>
                </form>
              </DialogContent>
            </Dialog>
          </CardContent>
        </Card>

        {/* Assessment + Blood Report Grid */}
        <div className="grid md:grid-cols-2 gap-5">
          {/* Assessment Card */}
          <Card className="border-border/60 bg-surface/50 shadow-card-soft backdrop-blur-sm">
            <CardContent className="p-5 flex flex-col justify-between h-[150px]">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold text-foreground">{tr("assessment", currentLang)}</h3>
                  {loadingStatus ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-teal" />
                  ) : (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        hasCompleted
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          : "bg-amber-500/10 text-amber-500 border-amber-500/20"
                      }`}
                    >
                      {hasCompleted ? `✓ ${tr("complete", currentLang)}` : `⌛ ${tr("pending", currentLang)}`}
                    </span>
                  )}
                </div>

                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{tr("status", currentLang)}</span>
                    <span className="font-medium text-foreground">
                      {hasCompleted ? tr("complete", currentLang) : tr("pending", currentLang)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{tr("lastCompleted", currentLang)}</span>
                    <span className="font-medium text-foreground">
                      {formatDate(assessmentStatus?.lastAssessmentUpdate)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  onClick={() => navigate({ to: "/assessment", search: { mode: "reassess" } })}
                  className="bg-teal text-white hover:bg-teal/90 font-semibold text-xs h-8 px-4 rounded-lg cursor-pointer inline-flex items-center gap-1"
                >
                  {tr("reassess", currentLang)} <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>

          {/* Blood Report Card */}
          <Card className="border-border/60 bg-surface/50 shadow-card-soft backdrop-blur-sm">
            <CardContent className="p-5 flex flex-col justify-between h-[150px]">
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h3 className="font-display text-sm font-bold text-foreground">{tr("bloodReport", currentLang)}</h3>
                  {loadingStatus ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin text-teal" />
                  ) : (
                    <span
                      className={`text-[10px] font-bold px-2 py-0.5 rounded-full border ${
                        hasBloodReport
                          ? "bg-emerald-500/10 text-emerald-600 border-emerald-500/20"
                          : "bg-muted text-muted-foreground border-border/40"
                      }`}
                    >
                      {hasBloodReport ? `✓ ${tr("uploaded", currentLang)}` : tr("noReport", currentLang)}
                    </span>
                  )}
                </div>

                <div className="space-y-1 pt-1">
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{tr("uploaded", currentLang)}</span>
                    <span className="font-medium text-foreground">
                      {hasBloodReport ? tr("yes", currentLang) : tr("no", currentLang)}
                    </span>
                  </div>
                  <div className="flex justify-between text-xs text-muted-foreground">
                    <span>{tr("lastUpload", currentLang)}</span>
                    <span className="font-medium text-foreground">
                      {formatDate(assessmentStatus?.bloodReportDate)}
                    </span>
                  </div>
                </div>
              </div>

              <div className="pt-2">
                <Button
                  onClick={() =>
                    hasBloodReport
                      ? navigate({ to: "/report" })
                      : navigate({ to: "/assessment", search: { mode: "retake", step: 5 } })
                  }
                  variant="outline"
                  className="border-border/60 hover:bg-accent/40 text-foreground font-semibold text-xs h-8 px-4 rounded-lg cursor-pointer inline-flex items-center gap-1"
                >
                  {hasBloodReport ? tr("viewReport", currentLang) : tr("uploadReportBtn", currentLang)} <ArrowRight className="h-3 w-3" />
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Quick Actions */}
        <Card className="border-border/60 bg-surface/50 shadow-card-soft backdrop-blur-sm">
          <CardContent className="p-5 space-y-4">
            <h3 className="text-xs font-bold text-muted-foreground uppercase tracking-wider">
              {tr("quickActions", currentLang)}
            </h3>
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
              {/* Action Plan */}
              <Button
                asChild
                variant="outline"
                className="h-10 text-xs border-border/60 hover:bg-teal/5 hover:border-teal/30 hover:text-teal font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all duration-200"
              >
                <Link to="/action-plan">
                  <LayoutDashboard className="h-4 w-4 shrink-0 text-teal/80" />
                  {tr("actionPlanNav", currentLang)}
                </Link>
              </Button>

              {/* Download PDF */}
              <Button
                variant="outline"
                onClick={() => navigate({ to: "/report", search: { download: "true" } })}
                className="h-10 text-xs border-border/60 hover:bg-teal/5 hover:border-teal/30 hover:text-teal font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all duration-200"
              >
                <FileDown className="h-4 w-4 shrink-0 text-teal/80" />
                {tr("downloadPdf", currentLang)}
              </Button>

              {/* Upload Report */}
              <Button
                asChild
                variant="outline"
                className="h-10 text-xs border-border/60 hover:bg-teal/5 hover:border-teal/30 hover:text-teal font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all duration-200"
              >
                <Link to="/assessment" search={{ mode: "retake", step: 5 }}>
                  <UploadCloud className="h-4 w-4 shrink-0 text-teal/80" />
                  {tr("uploadReportBtn", currentLang)}
                </Link>
              </Button>

              {/* Settings Trigger Modal */}
              <Dialog open={settingsOpen} onOpenChange={setSettingsOpen}>
                <DialogTrigger asChild>
                  <Button
                    variant="outline"
                    className="h-10 text-xs border-border/60 hover:bg-teal/5 hover:border-teal/30 hover:text-teal font-semibold rounded-xl flex items-center justify-center gap-2 cursor-pointer transition-all duration-200"
                  >
                    <Settings className="h-4 w-4 shrink-0 text-teal/80" />
                    {tr("settings", currentLang)}
                  </Button>
                </DialogTrigger>
                <DialogContent className="sm:max-w-md border-border bg-surface">
                  <DialogHeader>
                    <DialogTitle className="text-base font-bold">{tr("accountSettings", currentLang)}</DialogTitle>
                  </DialogHeader>

                  <div className="space-y-4 py-2">
                    {/* Language Switcher Row */}
                    <div className="flex items-center justify-between py-2 border-b border-border/40">
                      <div className="flex items-center gap-2.5">
                        <Globe className="h-4 w-4 text-muted-foreground" />
                        <div className="text-left">
                          <p className="text-xs font-semibold text-foreground">{tr("language", currentLang)}</p>
                          <p className="text-[10px] text-muted-foreground">{tr("changeInterfaceLanguage", currentLang)}</p>
                        </div>
                      </div>
                      <LanguageSwitcher variant="compact" />
                    </div>

                    {/* Theme Switcher Row */}
                    <div className="flex items-center justify-between py-2 border-b border-border/40">
                      <div className="flex items-center gap-2.5">
                        <Settings className="h-4 w-4 text-muted-foreground" />
                        <div className="text-left">
                          <p className="text-xs font-semibold text-foreground">{tr("interfaceTheme", currentLang)}</p>
                          <p className="text-[10px] text-muted-foreground">
                            {theme === "dark" ? tr("darkModeActive", currentLang) : tr("lightModeActive", currentLang)}
                          </p>
                        </div>
                      </div>
                      <button
                        onClick={toggleTheme}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                          theme === "dark" ? "bg-teal" : "bg-border"
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                            theme === "dark" ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </div>

                    {/* Notifications Switch Row */}
                    <div className="flex items-center justify-between py-2 border-b border-border/40">
                      <div className="flex items-center gap-2.5">
                        <Bell className="h-4 w-4 text-muted-foreground" />
                        <div className="text-left">
                          <p className="text-xs font-semibold text-foreground">Notifications</p>
                          <p className="text-[10px] text-muted-foreground">Receive weekly insights</p>
                        </div>
                      </div>
                      <button
                        onClick={() => setNotificationsEnabled(!notificationsEnabled)}
                        className={`relative inline-flex h-5 w-9 items-center rounded-full transition-colors duration-200 focus:outline-none ${
                          notificationsEnabled ? "bg-teal" : "bg-border"
                        }`}
                      >
                        <span
                          className={`inline-block h-3.5 w-3.5 transform rounded-full bg-white shadow transition-transform duration-200 ${
                            notificationsEnabled ? "translate-x-4" : "translate-x-0.5"
                          }`}
                        />
                      </button>
                    </div>

                    {/* Danger Zone: Delete Account */}
                    <div className="pt-2">
                      {!showDeleteConfirm ? (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => setShowDeleteConfirm(true)}
                          className="w-full justify-start h-8 px-2 text-xs font-semibold text-red-500 hover:bg-red-500/8 hover:text-red-600 rounded-lg"
                        >
                          <Trash2 className="h-3.5 w-3.5 mr-2" /> Delete Account
                        </Button>
                      ) : (
                        <div className="rounded-lg border border-red-500/20 bg-red-500/5 p-3 space-y-2">
                          <div className="flex items-start gap-2">
                            <ShieldAlert className="h-4 w-4 text-red-500 shrink-0 mt-0.5" />
                            <div className="space-y-1">
                              <p className="text-xs font-bold text-red-600 dark:text-red-400">
                                Permanently delete your data?
                              </p>
                              <p className="text-[10px] text-muted-foreground leading-relaxed">
                                This action is irreversible and will delete your profile history.
                              </p>
                            </div>
                          </div>
                          <div className="flex justify-end gap-1.5 pt-1">
                            <Button
                              variant="outline"
                              size="sm"
                              onClick={() => setShowDeleteConfirm(false)}
                              className="h-7 text-[10px]"
                            >
                              {tr("cancel", currentLang)}
                            </Button>
                            <Button
                              size="sm"
                              className="bg-red-600 text-white hover:bg-red-700 h-7 text-[10px] font-semibold"
                              onClick={() => {
                                toast.error("Contact support to request database erasure.");
                                setShowDeleteConfirm(false);
                                setSettingsOpen(false);
                              }}
                            >
                              Confirm Delete
                            </Button>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </DialogContent>
              </Dialog>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Sign Out Link */}
      <div className="text-center pt-4">
        <button
          onClick={logout}
          className="text-xs font-semibold text-muted-foreground hover:text-red-500 hover:underline cursor-pointer inline-flex items-center gap-1.5 transition-colors"
        >
          <LogOut className="h-3.5 w-3.5" />
          {tr("signOut", currentLang)}
        </button>
      </div>
    </div>
    </div>
  );
}
