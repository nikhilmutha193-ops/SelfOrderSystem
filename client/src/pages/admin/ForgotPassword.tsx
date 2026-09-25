import { useState } from "react";
import { useNavigate } from "react-router-dom";

import { Button, Card, ErrorText, Input } from "../../components/ui";
import { api, extractErrorMessage } from "../../lib/apiClient";

export default function ForgotPassword() {
  const [username, setUsername] = useState("");
  const [question, setQuestion] = useState<string | null>(null);
  const [securityAnswer, setSecurityAnswer] = useState("");
  const [newPassword, setNewPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const navigate = useNavigate();

  async function fetchQuestion(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      const res = await api.get("/auth/admin/security-question", { params: { username } });
      setQuestion(res.data.securityQuestion);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  async function resetPassword(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setLoading(true);
    try {
      await api.post("/auth/admin/forgot-password", { username, securityAnswer, newPassword });
      setMessage("Password updated. You can now sign in.");
      setTimeout(() => navigate("/admin/login"), 1500);
    } catch (err) {
      setError(extractErrorMessage(err));
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="mx-auto flex min-h-screen max-w-md flex-col justify-center gap-4 px-4">
      <h1 className="text-center text-2xl font-bold text-slate-800">Forgot Password</h1>
      <Card>
        {!question ? (
          <form onSubmit={fetchQuestion} className="flex flex-col gap-3">
            <label className="text-sm font-medium text-slate-700">
              Username
              <Input className="mt-1" value={username} onChange={(e) => setUsername(e.target.value)} required />
            </label>
            <ErrorText>{error}</ErrorText>
            <Button type="submit" disabled={loading}>
              {loading ? "Checking..." : "Continue"}
            </Button>
          </form>
        ) : (
          <form onSubmit={resetPassword} className="flex flex-col gap-3">
            <p className="text-sm text-slate-700">
              <strong>Security question:</strong> {question}
            </p>
            <label className="text-sm font-medium text-slate-700">
              Your answer
              <Input
                className="mt-1"
                value={securityAnswer}
                onChange={(e) => setSecurityAnswer(e.target.value)}
                required
              />
            </label>
            <label className="text-sm font-medium text-slate-700">
              New password
              <Input
                className="mt-1"
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                required
                minLength={6}
              />
            </label>
            <ErrorText>{error}</ErrorText>
            {message && <p className="text-sm text-green-700">{message}</p>}
            <Button type="submit" disabled={loading}>
              {loading ? "Updating..." : "Reset password"}
            </Button>
          </form>
        )}
      </Card>
    </div>
  );
}
