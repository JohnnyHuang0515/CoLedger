import { createContext, useContext } from 'react';
import type { Club, Role } from '../api/types';

export interface ClubContextValue {
  clubId: string;
  club: Club;
  myRole: Role;
  isOwner: boolean;
  canWrite: boolean; // OWNER or MEMBER (not VIEWER)
}

export const ClubContext = createContext<ClubContextValue | undefined>(undefined);

export function useClub(): ClubContextValue {
  const ctx = useContext(ClubContext);
  if (!ctx) throw new Error('useClub must be used within a ClubLayout');
  return ctx;
}

const LAST_CLUB_KEY = 'cst.lastClubId';
export function rememberClub(id: string): void {
  localStorage.setItem(LAST_CLUB_KEY, id);
}
export function getRememberedClub(): string | null {
  return localStorage.getItem(LAST_CLUB_KEY);
}
export function forgetClub(): void {
  localStorage.removeItem(LAST_CLUB_KEY);
}
