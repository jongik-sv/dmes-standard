"use client";

/**
 * 역할 칸 — 사람 기준(시안 colRoles: 고른 그룹에 든 역할)과 역할 기준(시안 colRoleAll: 모든 역할에서 고름).
 * 찾는 말(ROLE_ID·ROLE_NM)은 칸 안에만 둔다 — 한 글자마다 다른 칸을 다시 그리지 않는다. 고른 역할은 걸러져도 맨 위에 둔다.
 */
import { memo, useMemo, useState } from "react";
import { IconPencil, IconPlus } from "@tabler/icons-react";
import { Checkbox, Input } from "@dk-oasis/shared/form";
import { fmtNum, foundHint, permCntText, pickList, rolesOfGroup } from "./model";
import { LegacyIconButton, Panel, RoleChip, StatusTag, useBench } from "./parts";
import { linkDiffKind } from "./draft";
import { PERM_SYSADMIN_ROLE_ID, type BenchRoleRow } from "./types";

const SYS_LOCK = "시스템 관리자(SYSADMIN) 역할을 그룹에 넣고 빼는 일은 SYSADMIN 사용자만 합니다";
const FIND_LABEL = "역할 이름·ROLE_ID 찾기";

function useRoleFind(roles: readonly BenchRoleRow[], roleId: string | null) {
  const [q, setQ] = useState("");
  const { list, found } = useMemo(() => pickList(roles, roleId, q, (r) => r.ROLE_ID, (r) => `${r.ROLE_ID} ${r.ROLE_NM}`), [roles, roleId, q]);
  const input = <Input value={q} onChange={setQ} placeholder={FIND_LABEL} aria-label={FIND_LABEL} autoComplete="off" />;
  return { list, note: foundHint(found), input };
}

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
  /** 그룹 ↔ 역할 체크(GRP_ROLE 초안). */
  onToggleGroupRole: (roleId: string, on: boolean) => void;
}) {
  const { bench, base, isSysadmin } = useBench();
  const inGroup = rolesOfGroup(bench, groupId);
  const wasIn = rolesOfGroup(base, groupId);
  const gname = groupId ? bench.groupById.get(groupId)?.ROLE_GROUP_NM ?? groupId : "";
  const { list, note, input } = useRoleFind(bench.roles, roleId);

  return (
    <Panel
      title="역할"
      count={bench.roles.length}
      icons={<RoleIcons roleId={roleId} />}
      hint={
        groupId ? (
          <>
            {input}
            {note && <span>{note}</span>}
            <span>
              체크 = <b>「{gname}」</b>에 든 역할. 체크된 역할만 눌러 고릅니다.
            </span>
          </>
        ) : undefined
      }
    >
      {!groupId ? (
        <span className="pb-empty-note">고른 역할 그룹이 없습니다.</span>
      ) : !list.length ? (
        <span className="pb-empty-note">찾는 역할이 없습니다.</span>
      ) : (
        list.map((r) => {
          const on = inGroup.includes(r.ROLE_ID);
          const cur = r.ROLE_ID === roleId;
          const chg = linkDiffKind(wasIn.includes(r.ROLE_ID), on);
          const sysLock = !isSysadmin && r.ROLE_ID === PERM_SYSADMIN_ROLE_ID;
          return (
            <div key={r.ROLE_ID} className={`pb-pick${cur ? " is-on" : ""}`}>
              <span title={canEdit && sysLock ? SYS_LOCK : undefined}>
                <Checkbox
                  checked={on}
                  disabled={!canEdit || sysLock}
                  aria-label={`${r.ROLE_NM}을(를) 그룹에 넣기`}
                  onChange={(v) => onToggleGroupRole(r.ROLE_ID, v)}
                />
              </span>
              <button type="button" className="pb-pick__nm" disabled={!on} onClick={() => onSelect(r.ROLE_ID)} aria-pressed={cur}>
                <span>
                  <RoleChip roleId={r.ROLE_ID} />
                  {r.USE_TP === "N" && <StatusTag kind="block">사용 안 함</StatusTag>}
                  {chg && (
                    <StatusTag kind={chg} title={chg === "add" ? "초안에서 이 그룹에 넣음" : "초안에서 이 그룹에서 뺌"}>
                      {chg === "add" ? "넣음" : "뺌"}
                    </StatusTag>
                  )}
                </span>
                <small>
                  {permCntText(r.PERM_CNT)} · 사람 {fmtNum(r.USER_CNT)}명
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
  const { list, note, input } = useRoleFind(bench.roles, roleId);

  return (
    <Panel
      title="역할"
      count={bench.roles.length}
      icons={<RoleIcons roleId={roleId} />}
      hint={
        <>
          {input}
          {note && <span>{note}</span>}
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
                {permCntText(r.PERM_CNT)} · 사람 {fmtNum(r.USER_CNT)}명 · 그룹 {r.GROUP_CNT}개
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
