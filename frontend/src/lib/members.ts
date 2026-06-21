import type { Role } from '../api/types';

// 角色排序權重：團主最前，其次成員、唯讀。
const ROLE_RANK: Record<Role, number> = { OWNER: 0, MEMBER: 1, VIEWER: 2 };

export function roleRank(role: Role): number {
  return ROLE_RANK[role] ?? ROLE_RANK.MEMBER;
}

// 依角色排序（團主置頂）。同角色維持原順序（Array.sort 穩定）。
export function sortByRole<T extends { role: Role }>(list: T[]): T[] {
  return [...list].sort((a, b) => roleRank(a.role) - roleRank(b.role));
}
