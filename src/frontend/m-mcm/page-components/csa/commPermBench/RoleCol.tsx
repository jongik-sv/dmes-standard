"use client";

/** 역할 칸 — 사람 기준(시안 colRoles: 고른 그룹에 든 역할)과 역할 기준(시안 colRoleAll: 모든 역할에서 고름). */
import { memo, useMemo, useState } from "react";
import { IconPencil, IconPlus } from "@tabler/icons-react";
import { Checkbox, Input } from "@dk-oasis/shared/form";
import { fmtNum, rolesOfGroup } from "./model";
import { LegacyIconButton, Panel, RoleChip, StatusTag, useBench } from "./parts";

function RoleIcons({ roleId }: { roleId: string | null }) {
  return (
    <>
      <LegacyIconButton target="role" mode="edit" id={roleId} label="고른 역할 편집" icon={<IconPencil size={16} />} disabled={!roleId} />
      <LegacyIconButton target="role" mode="new" label="역할 추가" icon={<IconPlus size={16} />} />
    </>
  );
}

export const RoleCol = memo(function RoleCol({ groupId, roleId, canEdit, onSelect, onToggleGroupRole }: {
  groupId: string | null;
  roleId: string | null;
  canEdit: boolean;
  onSelect: (roleId: string) => void;
  /** 2단계(f3) 자리 — 그룹 ↔ 역할 체크. */
  onToggleGroupRole: (roleId: string, on: boolean) => void;
}) {
  const { bench } = useBench();
  const inGroup = rolesOfGroup(bench, groupId);
  const gname = groupId ? bench.groupById.get(groupId)?.ROLE_GROUP_NM ?? groupId : "";

  return (
    <Panel
      title="역할"
      count={bench.roles.length}
      icons={<RoleIcons roleId={roleId} />}
      hint={
        groupId ? (
          <span>
            체크 = <b>「{gname}」</b>에 든 역할. 체크된 역할만 눌러 고릅니다.
          </span>
        ) : undefined
      }
    >
      {!groupId ? (
        <span className="pb-empty-note">고른 역할 그룹이 없습니다.</span>
      ) : (
        bench.roles.map((r) => {
          const on = inGroup.includes(r.ROLE_ID);
          const cur = r.ROLE_ID === roleId;
          return (
            <div key={r.ROLE_ID} className={`pb-pick${cur ? " is-on" : ""}`}>
              <Checkbox checked={on} disabled={!canEdit} aria-label={`${r.ROLE_NM}을(를) 그룹에 넣기`} onChange={(v) => onToggleGroupRole(r.ROLE_ID, v)} />
              <button type="button" className="pb-pick__nm" disabled={!on} onClick={() => onSelect(r.ROLE_ID)} aria-pressed={cur}>
                <span>
                  <RoleChip roleId={r.ROLE_ID} />
                  {r.USE_TP === "N" && <StatusTag kind="block">사용 안 함</StatusTag>}
                </span>
                <small>
                  메뉴 {fmtNum(r.PERM_CNT)}개 · 사람 {fmtNum(r.USER_CNT)}명
                </small>
              </button>
              {cur && <span className="pb-pick__go">›</span>}
            </div>
          );
        })
      )}
    </Panel>
  );
});

export const RoleAllCol = memo(function RoleAllCol({ roleId, onSelect }: { roleId: string | null; onSelect: (roleId: string) => void }) {
  const { bench } = useBench();
  const [q, setQ] = useState("");
  const list = useMemo(() => {
    const t = q.trim().toLowerCase();
    return t ? bench.roles.filter((r) => r.ROLE_NM.toLowerCase().includes(t) || r.ROLE_ID.toLowerCase().includes(t)) : bench.roles;
  }, [bench, q]);

  return (
    <Panel
      title="역할"
      count={bench.roles.length}
      icons={<RoleIcons roleId={roleId} />}
      hint={
        <>
          <Input value={q} onChange={setQ} placeholder="역할 이름·ROLE_ID 찾기" aria-label="역할 이름·ROLE_ID 찾기" autoComplete="off" />
          <span>사람을 고르지 않고 역할만 고릅니다. 오른쪽은 이 역할만 받은 가상의 사람으로 그립니다.</span>
        </>
      }
    >
      {list.map((r) => {
        const cur = r.ROLE_ID === roleId;
        return (
          <div key={r.ROLE_ID} className={`pb-pick${cur ? " is-on" : ""}`}>
            <button type="button" className="pb-pick__nm" onClick={() => onSelect(r.ROLE_ID)} aria-pressed={cur}>
              <span>
                <RoleChip roleId={r.ROLE_ID} />
                {r.USE_TP === "N" && <StatusTag kind="block">사용 안 함</StatusTag>}
              </span>
              <small>
                메뉴 {fmtNum(r.PERM_CNT)}개 · 사람 {fmtNum(r.USER_CNT)}명 · 그룹 {r.GROUP_CNT}개
              </small>
            </button>
            {cur && <span className="pb-pick__go">›</span>}
          </div>
        );
      })}
      {!list.length && <span className="pb-empty-note">찾는 역할이 없습니다.</span>}
    </Panel>
  );
});
