import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router-dom';
import { login } from '../api/endpoints';
import { useAuth } from '../auth/AuthContext';
import { Button, Card } from '../components/ui';
import { PasswordInput } from '../components/PasswordInput';
import { errorCode, errorMessage } from '../lib/errors';
import { getRememberedClub } from '../club/ClubContext';

export function LoginPage() {
  const [email, setEmail] = useState('');
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
      const res = await login({ email, password });
      loginWithResult(res);
      if (next) {
        navigate(next);
      } else {
        const last = getRememberedClub();
        navigate(last ? `/clubs/${last}` : '/');
      }
    } catch (err) {
      // 登入失敗＝帳密錯誤（後端回 401 UNAUTHORIZED）。全域 errorMessage 會把 UNAUTHORIZED
      // 翻成「請先登入。」，在登入頁讀起來很怪——這裡改用帳密提示；連線等其他錯誤維持原訊息。
      setError(
        errorCode(err) === 'UNAUTHORIZED' ? 'Email 或密碼錯誤，請重新確認。' : errorMessage(err),
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="flex min-h-[100dvh] items-center justify-center bg-app px-4">
      <Card className="w-full max-w-sm p-8">
        <h1 className="mb-1 text-xl font-bold text-text-primary">
          同甘共股 <span className="text-sm font-normal text-text-muted">CoLedger</span>
        </h1>
        <p className="mb-6 text-sm text-text-secondary">社團一起買，賺賠算清楚 · 登入以開始</p>
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
      </Card>
    </div>
  );
}
