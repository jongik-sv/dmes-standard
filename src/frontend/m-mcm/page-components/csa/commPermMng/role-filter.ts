/**
 * commPermMng 조회 조건 「역할」 콤보 목록(z2 F4). 역할이 많아 입력해서 찾는다(shared ComboBox searchable).
 * 표시 글 = 「이름 (ID)」 — 콤보가 표시 글로 거르므로 이름·ID 둘 다로 찾을 수 있다. 맨 앞 「전체」(빈 값) = 역할 조건 없음.
 */
import type { PermRoleLov } from "./types";

export interface RoleFilterOption {
  value: string;
  label: string;
}

export const ROLE_FILTER_ALL: RoleFilterOption = { value: "", label: "전체" };

export function roleFilterOptions(roles: readonly PermRoleLov[]): RoleFilterOption[] {
  return [ROLE_FILTER_ALL, ...roles.map((r) => ({ value: r.ROLE_ID, label: r.ROLE_NM ? `${r.ROLE_NM} (${r.ROLE_ID})` : r.ROLE_ID }))];
}
