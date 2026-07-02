import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";
import { Gift } from "lucide-react";
import { useAuthStore } from "../../store/authStore";

const inputClass =
  "h-11 rounded-lg border border-border bg-surface px-3.5 text-sm text-ink outline-none transition-colors focus:border-brand/50 focus:bg-white placeholder:text-ink/35";

export default function AuthScreen() {
  const [mode, setMode] = useState<"signin" | "signup">("signin");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [info, setInfo] = useState<string | null>(null);
  const signIn = useAuthStore((s) => s.signIn);
  const signUp = useAuthStore((s) => s.signUp);
  const error = useAuthStore((s) => s.error);

  const handleSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    setSubmitting(true);
    setInfo(null);
    if (mode === "signin") {
      await signIn(email, password);
    } else {
      const { error: signUpError } = await signUp(email, password);
      if (!signUpError) {
        setInfo("Check your email to confirm your account, then sign in.");
      }
    }
    setSubmitting(false);
  };

  return (
    <div className="min-h-screen bg-surface flex flex-col items-center justify-center px-6 py-12">
      <div className="w-full max-w-sm bg-surface-card rounded-2xl shadow-xl border border-border p-7 sm:p-8">
        <div className="text-center mb-7">
          <Link to="/" className="inline-block mb-3">
            <div className="size-12 rounded-full bg-brand/10 text-brand grid place-items-center mx-auto">
              <Gift className="size-5" />
            </div>
          </Link>
          <h1 className="font-display text-xl text-brand italic font-bold">Araliya</h1>
          <p className="text-sm text-ink/50 mt-1">
            {mode === "signin"
              ? "Sign in to pick up where you left off"
              : "Create an account to save your chats"}
          </p>
        </div>
        <form onSubmit={handleSubmit} className="flex flex-col gap-3">
          <input
            type="email"
            required
            autoComplete="email"
            placeholder="Email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
          <input
            type="password"
            required
            minLength={6}
            autoComplete={mode === "signin" ? "current-password" : "new-password"}
            placeholder="Password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          {error && (
            <p role="alert" className="text-xs text-danger">
              {error}
            </p>
          )}
          {info && <p className="text-xs text-success">{info}</p>}
          <button
            type="submit"
            disabled={submitting}
            className="h-11 rounded-lg bg-brand text-white font-semibold text-sm mt-1 hover:bg-brand-dark transition-colors disabled:opacity-60"
          >
            {submitting ? "…" : mode === "signin" ? "Sign in" : "Create account"}
          </button>
        </form>
        <button
          type="button"
          onClick={() => {
            setMode(mode === "signin" ? "signup" : "signin");
            setInfo(null);
          }}
          className="w-full text-center mt-5 text-sm text-ink/50 hover:text-brand transition-colors"
        >
          {mode === "signin" ? "Need an account? Sign up" : "Already have an account? Sign in"}
        </button>
      </div>
    </div>
  );
}