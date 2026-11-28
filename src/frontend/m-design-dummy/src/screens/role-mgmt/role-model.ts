/**
 * 역할 관리 시안 3종이 함께 쓰는 계산. 표본 데이터(role-mgmt-mock)만 읽는다.
 */
import { useCallback, useMemo, useState } from "react";
import {
  INITIAL_GRANTS,
  NONE,
  PERM_LEVELS,
  PERM_LEVEL_BY_ID,
  ROLE_GROUPS,
  ROLES,
  SCREENS,
  USERS,
  type GrantMap,
  type RoleRecord,
} from "../../data/role-mgmt-mock";

export type ChangeKind = "추가" | "변경" | "회수";

export const LEVEL_LABELS: Record<string, string> = Object.fromEntries(PERM_LEVELS.map((l) => [l.id, l.label]));

/** 화면마다 고를 수 있는 수준. 업무 전용 묶음(레포트 실행)은 그 화면에서만 보인다. */
export function levelsFor(screenId: string): string[] {
  return PERM_LEVELS.filter((l) => !l.onlyScreens || l.onlyScreens.includes(screenId)).map((l) => l.id);
}

/** 칩을 누를 때 다음 수준(없음 → 조회 → 편집 → 편집·확정 → 전체 → 없음). */
export function nextLevel(screenId: string, current: string): string {
  const list = levelsFor(screenId);
  const i = list.indexOf(current);
  return list[(i + 1) % list.length];
}

export const levelOf = (grants: GrantMap, roleId: string, screenId: string) => grants[roleId]?.[screenId] ?? NONE;

export function changeKind(before: string, after: string): ChangeKind | null {
  if (before === after) return null;
  if (before === NONE) return "추가";
  if (after === NONE) return "회수";
  return "변경";
}

export const KIND_TONE: Record<ChangeKind, { bg: string; color: string }> = {
  추가: { bg: "var(--color-success-soft)", color: "var(--color-success)" },
  변경: { bg: "var(--color-warning-soft)", color: "var(--color-warning)" },
  회수: { bg: "var(--color-danger-soft)", color: "var(--color-danger)" },
};

/** 수준 색 클래스. 권한이 셀수록 짙은 파랑, 업무 전용 묶음은 보라 대신 테두리형. */
export function levelClass(levelId: string): string {
  const level = PERM_LEVEL_BY_ID.get(levelId);
  if (!level || level.id === NONE) return "role-lv role-lv--0";
  if (level.rank >= 99) return "role-lv role-lv--special";
  return `role-lv role-lv--${level.rank}`;
}

export const groupsOfRole = (roleId: string) => ROLE_GROUPS.filter((g) => g.roleIds.includes(roleId));

export function usersOfRole(roleId: string) {
  const groupIds = new Set(groupsOfRole(roleId).map((g) => g.id));
  return USERS.filter((u) => u.groupIds.some((id) => groupIds.has(id)));
}

export function rolesOfUser(userId: string): string[] {
  const user = USERS.find((u) => u.userId === userId);
  if (!user) return [];
  const ids = new Set<string>();
  for (const g of ROLE_GROUPS) if (user.groupIds.includes(g.id)) g.roleIds.forEach((r) => ids.add(r));
  return [...ids];
}

export interface EffectiveGrant {
  screenId: string;
  level: string;
  /** 이 화면 권한을 주는 역할과 그 수준. 높은 수준이 앞. */
  givers: { roleId: string; level: string }[];
}

/**
 * 사람이 실제로 받는 화면 권한. 같은 화면을 여러 역할이 주면 높은 수준을 쓴다.
 * `roleIds` 를 주면 그 역할만 켠 것으로 계산한다(그 사람 눈으로 보기의 역할 켜고 끄기).
 */
export function effectiveGrants(grants: GrantMap, roleIds: string[], roles: RoleRecord[] = ROLES): EffectiveGrant[] {
  const active = roleIds.filter((id) => roles.find((r) => r.roleId === id)?.useYn === "Y");
  return SCREENS.flatMap((s) => {
    const givers = active
      .map((roleId) => ({ roleId, level: levelOf(grants, roleId, s.id) }))
      .filter((g) => g.level !== NONE)
      .sort((a, b) => (PERM_LEVEL_BY_ID.get(b.level)?.rank ?? 0) - (PERM_LEVEL_BY_ID.get(a.level)?.rank ?? 0));
    if (givers.length === 0) return [];
    return [{ screenId: s.id, level: givers[0].level, givers }];
  });
}

/** 화면 권한 초안(저장 전 변경)을 들고 있는 훅. 시안 B 가 쓴다. */
export function useGrantDraft() {
  const [saved, setSaved] = useState<GrantMap>(INITIAL_GRANTS);
  const [grants, setGrants] = useState<GrantMap>(INITIAL_GRANTS);

  const setLevel = useCallback((roleId: string, screenId: string, levelId: string) => {
    setGrants((prev) => {
      const next = { ...prev, [roleId]: { ...(prev[roleId] ?? {}) } };
      if (levelId === NONE) delete next[roleId][screenId];
      else next[roleId][screenId] = levelId;
      return next;
    });
  }, []);

  const changes = useMemo(() => {
    const out: { roleId: string; screenId: string; before: string; after: string; kind: ChangeKind }[] = [];
    for (const r of ROLES) {
      for (const s of SCREENS) {
        const before = levelOf(saved, r.roleId, s.id);
        const after = levelOf(grants, r.roleId, s.id);
        const kind = changeKind(before, after);
        if (kind) out.push({ roleId: r.roleId, screenId: s.id, before, after, kind });
      }
    }
    return out;
  }, [grants, saved]);

  const commit = useCallback(() => setSaved(grants), [grants]);
  const reset = useCallback(() => setGrants(saved), [saved]);

  return { grants, saved, setLevel, changes, commit, reset };
}

export const roleName = (roleId: string) => ROLES.find((r) => r.roleId === roleId)?.name ?? roleId;
