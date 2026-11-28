"use client";

/**
 * 역할 그룹 칸(시안 colGroups). 체크 = 고른 사람이 속한 그룹(초안 포함). 2단계부터 체크로 넣고 뺀다(USER_GRP).
 * SYSADMIN 을 주는 그룹의 소속은 SYSADMIN 사용자만 바꾼다 — 그렇지 않으면 체크를 잠그고 이유를 보인다.
 * 찾는 말(ROLE_GROUP_ID·ROLE_GROUP_NM)은 이 칸 안에만 둔다 — 한 글자마다 다른 칸을 다시 그리지 않는다.
 */
import { memo, useMemo, useState } from "react";
import { IconPencil, IconPlus } from "@tabler/icons-react";
import { Checkbox, Input } from "@dk-oasis/shared/form";
import { fmtNum, foundHint, groupsOfUser, pickList, rolesOfGroup } from "./model";
import { groupGivesSysadmin, linkDiffKind } from "./draft";
import { LegacyIconButton, Panel, StatusTag, useBench } from "./parts";

const SYS_LOCK = "시스템 관리자(SYSADMIN) 역할을 주는 그룹의 소속은 SYSADMIN 사용자만 바꿉니다";

export const GroupCol = memo(function GroupCol({ userId, groupId, canEdit, onSelect, onToggleMember }: {
  userId: string | null;
  groupId: string | null;
  canEdit: boolean;
  onSelect: (groupId: string) => void;
  /** 사람 ↔ 그룹 체크(USER_GRP 초안). */
  onToggleMember: (groupId: string, on: boolean) => void;
}) {
  const { bench, base, isSysadmin } = useBench();
  const user = userId ? bench.userById.get(userId) : undefined;
  const mine = userId ? groupsOfUser(bench, userId) : [];
  const was = userId ? groupsOfUser(base, userId) : [];
  const uname = user?.USER_NM ?? "";
  const [q, setQ] = useState("");
  const { list, found } = useMemo(
    () => pickList(bench.groups, groupId, q, (g) => g.ROLE_GROUP_ID, (g) => `${g.ROLE_GROUP_ID} ${g.ROLE_GROUP_NM}`),
    [bench.groups, groupId, q],
  );
  const note = foundHint(found);

  return (
    <Panel
      title="역할 그룹"
      count={bench.groups.length}
      icons={
        <>
          <LegacyIconButton target="group" mode="edit" id={groupId} label="고른 역할 그룹 편집" icon={<IconPencil size={16} />} disabled={!groupId} />
          <LegacyIconButton target="group" mode="new" label="역할 그룹 추가" icon={<IconPlus size={16} />} />
        </>
      }
      hint={
        <>
          <Input value={q} onChange={setQ} placeholder="그룹 이름·ROLE_GROUP_ID 찾기" aria-label="그룹 이름·ROLE_GROUP_ID 찾기" autoComplete="off" />
          {note && <span>{note}</span>}
          <span>
            체크 = <b>「{uname}」</b>이(가) 속한 그룹. 체크된 그룹만 눌러 고릅니다.{canEdit && " 체크를 바꾸면 초안에 담깁니다."}
          </span>
        </>
      }
    >
      {list.map((g) => {
        const gid = g.ROLE_GROUP_ID;
        const mem = mine.includes(gid);
        const on = gid === groupId;
        const chg = linkDiffKind(was.includes(gid), mem);
        const sysLock = !isSysadmin && (groupGivesSysadmin(base, gid) || groupGivesSysadmin(bench, gid));
        return (
          <div key={gid} className={`pb-pick${on ? " is-on" : ""}`}>
            <span title={canEdit && sysLock ? SYS_LOCK : undefined}>
              <Checkbox
                checked={mem}
                disabled={!canEdit || sysLock}
                aria-label={`${uname}을(를) ${g.ROLE_GROUP_NM}에 넣기`}
                onChange={(v) => onToggleMember(gid, v)}
              />
            </span>
            <button
              type="button"
              className="pb-pick__nm"
              disabled={!mem}
              title={mem ? undefined : `${uname}이(가) 속하지 않은 그룹이라 고를 수 없습니다.`}
              onClick={() => onSelect(gid)}
              aria-pressed={on}
            >
              <span>
                {g.ROLE_GROUP_NM}
                {g.USE_TP === "N" && <StatusTag kind="block">사용 안 함</StatusTag>}
                {chg && (
                  <StatusTag kind={chg} title={chg === "add" ? "초안에서 이 그룹에 넣음" : "초안에서 이 그룹에서 뺌"}>
                    {chg === "add" ? "넣음" : "뺌"}
                  </StatusTag>
                )}
              </span>
              <small>
                역할 {rolesOfGroup(bench, gid).length}개 · 사람 {fmtNum(g.USER_CNT)}명
              </small>
            </button>
            {on && <span className="pb-pick__go">›</span>}
          </div>
        );
      })}
      {!list.length && <span className="pb-empty-note">찾는 그룹이 없습니다.</span>}
    </Panel>
  );
});
