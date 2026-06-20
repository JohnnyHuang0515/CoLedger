import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { login } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { Button, Card } from '../components/ui';
import { PasswordInput } from '../components/PasswordInput';
import { errorMessage } from '../lib/errors';
import { getRememberedClub } from '../club/ClubContext';

export function LoginPage() {
  // demo prefill per BUILD-CONTRACT §5
  const [email, setEmail] = useState('alice@demo.tw');
  const [password, setPassword] = useState('demo1234');
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const { loginWithResult } = useAuth();
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const next = params.get('next');

  const onSubmit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      const res = await login({ email, password });
      loginWithResult(res);
      if (next) {
        navigate(next);
      } else {
        const last = getRememberedClub();
        navigate(last ? `/clubs/${last}` : '/');
      }
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-screen items-center justify-center bg-app px-4">
      <Card className="w-full max-w-sm p-8">
        <h1 className="mb-1 text-xl font-bold text-text-primary">協作股票紀錄</h1>
        <p className="mb-6 text-sm text-text-secondary">登入以查看與登錄交易</p>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              className="rounded-lg border border-border px-3 py-2 text-sm font-normal outline-none focus:border-primary"
            />
          </label>
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            密碼
            <PasswordInput
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
            />
          </label>
          {error && (
            <div className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss">{error}</div>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? '登入中…' : '登入'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-text-secondary">
          還沒有帳號？{' '}
          <Link
            to={next ? `/register?next=${encodeURIComponent(next)}` : '/register'}
            className="font-medium text-primary hover:underline"
          >
            註冊
          </Link>
        </p>
        <p className="mt-3 rounded-lg bg-subtle px-3 py-2 text-center text-xs text-text-muted">
          Demo：alice@demo.tw / demo1234
        </p>
      </Card>
    </div>
  );
}
