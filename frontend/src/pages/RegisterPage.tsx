import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { register } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { Button, Card } from '../components/ui';
import { PasswordInput } from '../components/PasswordInput';
import { errorMessage } from '../lib/errors';

export function RegisterPage() {
  const [email, setEmail] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [password, setPassword] = useState('');
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
      const res = await register({ email, display_name: displayName, password });
      loginWithResult(res);
      navigate(next || '/');
    } catch (err) {
      setError(errorMessage(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-app px-4">
      <Card className="w-full max-w-sm p-8">
        <h1 className="mb-1 text-xl font-bold text-text-primary">建立帳號</h1>
        <p className="mb-6 text-sm text-text-secondary">註冊後即可建立或加入社團</p>
        <form onSubmit={onSubmit} className="flex flex-col gap-4">
          <label className="flex flex-col gap-1.5 text-sm font-medium">
            顯示名稱
            <input
              type="text"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              required
              className="rounded-lg border border-border px-3 py-2 text-sm font-normal outline-none focus:border-primary"
            />
          </label>
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
              minLength={6}
              placeholder="至少 6 碼"
            />
          </label>
          {error && (
            <div className="rounded-lg bg-loss-soft px-3 py-2 text-sm text-loss">{error}</div>
          )}
          <Button type="submit" disabled={busy} className="w-full">
            {busy ? '註冊中…' : '註冊'}
          </Button>
        </form>
        <p className="mt-6 text-center text-sm text-text-secondary">
          已經有帳號？{' '}
          <Link
            to={next ? `/login?next=${encodeURIComponent(next)}` : '/login'}
            className="font-medium text-primary hover:underline"
          >
            登入
          </Link>
        </p>
      </Card>
    </div>
  );
}
