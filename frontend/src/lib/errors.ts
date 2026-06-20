import { ApiError } from '../api/client';
import type { ApiErrorCode } from '../api/types';

// Human-readable Traditional-Chinese messages keyed by the locked §6.5 error codes.
const MESSAGES: Record<string, string> = {
  NETWORK_ERROR: '無法連線到伺服器，請確認後端是否啟動 (:8000)。',
  INVALID_REQUEST: '請求格式錯誤。',
  UNAUTHORIZED: '請先登入。',
  FORBIDDEN: '權限不足，無法執行此操作。',
  CLUB_NOT_FOUND: '找不到社團。',
  TRANSACTION_NOT_FOUND: '找不到此筆交易。',
  MEMBER_NOT_FOUND: '找不到此成員。',
  STOCK_NOT_FOUND: '找不到此股票代號。',
  ALREADY_MEMBER: '對方已是社團成員。',
  CANNOT_REMOVE_SOLE_OWNER: '無法移除或降級唯一的團主。',
  INVALID_TRANSACTION_INPUT: '交易資料不合法：請確認代號存在、數量與價格為正數。',
  INSUFFICIENT_HOLDING: '賣出數量超過目前持有股數。',
  INTERNAL_ERROR: '系統發生錯誤，請稍後再試。',
};

export function errorMessage(err: unknown): string {
  if (err instanceof ApiError) {
    return MESSAGES[err.code] ?? err.message ?? '發生未知錯誤。';
  }
  if (err instanceof Error) return err.message;
  return '發生未知錯誤。';
}

export function errorCode(err: unknown): ApiErrorCode | string | null {
  if (err instanceof ApiError) return err.code;
  return null;
}

export function isForbidden(err: unknown): boolean {
  return err instanceof ApiError && (err.code === 'FORBIDDEN' || err.status === 403);
}
