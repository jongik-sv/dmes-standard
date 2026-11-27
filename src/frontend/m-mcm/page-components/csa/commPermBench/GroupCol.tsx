"use client";

/** 역할 그룹 칸(시안 colGroups). 체크 = 고른 사람이 속한 그룹. 1단계는 보기만. */
import { memo } from "react";
import { IconPencil, IconPlus } from "@tabler/icons-react";
import { Checkbox } from "@dk-oasis/shared/form";
import { fmtNum, groupsOfUser, rolesOfGroup } from "./model";
import { LegacyIconButton, Panel, StatusTag, useBench } from "./parts";

export const GroupCol = memo(function GroupCol({ userId, groupId, canEdit, onSelect, onToggleMember }: {
  userId: string | null;
  groupId: string | null;
  canEdit: boolean;
  onSelect: (groupId: string) => void;
  /** 2단계(f3) 자리 — 사람 ↔ 그룹 체크. */
  onToggleMember: (groupId: string, on: boolean) => void;
}) {
  const { bench } = useBench();
  const user = userId ? bench.userById.get(userId) : undefined;
  const mine = userId ? groupsOfUser(bench, userId) : [];
  const uname = user?.USER_NM ?? "";

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
        <span>
          체크 = <b>「{uname}」</b>이(가) 속한 그룹. 체크된 그룹만 눌러 고릅니다.
        </span>
      }
    >
      {bench.groups.map((g) => {
        const mem = mine.includes(g.ROLE_GROUP_ID);
        const on = g.ROLE_GROUP_ID === groupId;
        return (
          <div key={g.ROLE_GROUP_ID} className={`pb-pick${on ? " is-on" : ""}`}>
            <Checkbox
              checked={mem}
              disabled={!canEdit}
              aria-label={`${uname}을(를) ${g.ROLE_GROUP_NM}에 넣기`}
              onChange={(v) => onToggleMember(g.ROLE_GROUP_ID, v)}
            />
            <button
              type="button"
              className="pb-pick__nm"
              disabled={!mem}
              title={mem ? undefined : `${uname}이(가) 속하지 않은 그룹이라 고를 수 없습니다.`}
              onClick={() => onSelect(g.ROLE_GROUP_ID)}
              aria-pressed={on}
            >
              <span>
                {g.ROLE_GROUP_NM}
                {g.USE_TP === "N" && <StatusTag kind="block">사용 안 함</StatusTag>}
              </span>
              <small>
                역할 {rolesOfGroup(bench, g.ROLE_GROUP_ID).length}개 · 사람 {fmtNum(g.USER_CNT)}명
              </small>
            </button>
            {on && <span className="pb-pick__go">›</span>}
          </div>
        );
      })}
    </Panel>
  );
});
