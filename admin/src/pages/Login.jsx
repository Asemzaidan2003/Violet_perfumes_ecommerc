import { useState } from "react";
import { Navigate, useLocation, useNavigate } from "react-router-dom";
import { Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useAuth } from "@/app/auth";

export default function LoginPage() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const [error, setError] = useState("");
  const [pending, setPending] = useState(false);

  if (user) return <Navigate to={location.state?.from ?? "/pos"} replace />;

  async function onSubmit(e) {
    e.preventDefault();
    const form = new FormData(e.currentTarget);
    setPending(true);
    setError("");
    try {
      await login(String(form.get("username")).trim(), String(form.get("password")));
      navigate(location.state?.from ?? "/pos", { replace: true });
    } catch (err) {
      setError(err.status === 429 ? "محاولات كثيرة، حاول لاحقًا" : err.status === 401 ? "اسم المستخدم أو كلمة المرور غير صحيحة" : err.message);
    } finally {
      setPending(false);
    }
  }

  return (
    <main className="grid min-h-dvh place-items-center p-4">
      <Card className="w-full max-w-sm">
        <CardHeader><CardTitle className="text-xl">تسجيل الدخول</CardTitle></CardHeader>
        <CardContent>
          <form onSubmit={onSubmit} className="space-y-4" noValidate>
            <div className="space-y-2">
              <Label htmlFor="username">اسم المستخدم</Label>
              <Input id="username" name="username" autoComplete="username" required className="h-11 text-base" />
            </div>
            <div className="space-y-2">
              <Label htmlFor="password">كلمة المرور</Label>
              <Input id="password" name="password" type="password" autoComplete="current-password" required className="h-11 text-base" />
            </div>
            {error && <p role="alert" className="text-sm font-medium text-destructive">{error}</p>}
            <Button type="submit" className="h-11 w-full" disabled={pending}>
              {pending && <Loader2 className="animate-spin" aria-hidden />} دخول
            </Button>
          </form>
        </CardContent>
      </Card>
    </main>
  );
}
