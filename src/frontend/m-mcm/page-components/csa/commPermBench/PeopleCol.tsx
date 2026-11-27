"use client";

/** 사람 칸(시안 colPeople). 찾는 말은 이 칸 안에만 둔다 — 한 글자마다 다른 칸을 다시 그리지 않는다. */
import { memo, useMemo, useState } from "react";
import { IconPencil, IconPlus } from "@tabler/icons-react";
import { Input } from "@dk-oasis/shared/form";
import { fmtNum, groupsOfUser, peopleList } from "./model";
import { LegacyIconButton, Panel, StatusTag, useBench } from "./parts";

export const PeopleCol = memo(function PeopleCol({ userId, onSelect }: { userId: string | null; onSelect: (userId: string) => void }) {
  const { bench } = useBench();
  const [q, setQ] = useState("");
  const { list, found } = useMemo(() => peopleList(bench, userId, q), [bench, userId, q]);

  return (
    <Panel
      title="사람"
      count={fmtNum(bench.users.length)}
      icons={
        <>
          <LegacyIconButton target="user" mode="edit" id={userId} label="고른 사람 편집" icon={<IconPencil size={16} />} disabled={!userId} />
          <LegacyIconButton target="user" mode="new" label="사용자 추가" icon={<IconPlus size={16} />} />
        </>
      }
      hint={
        <>
          <Input value={q} onChange={setQ} placeholder="이름·부서·사번 찾기" aria-label="이름·부서·사번 찾기" autoComplete="off" />
          <span>{found !== null ? `${fmtNum(found)}명 찾음${found > list.length ? ` · 앞 ${list.length}명만 보입니다` : ""}` : "그룹마다 한 명씩 예시를 보입니다. 찾기로 다른 사람을 고릅니다."}</span>
        </>
      }
    >
      {list.map((p) => {
        const on = p.USER_ID === userId;
        return (
          <div key={p.USER_ID} className={`pb-pick${on ? " is-on" : ""}`}>
            <button type="button" className="pb-pick__nm" onClick={() => onSelect(p.USER_ID)} aria-pressed={on}>
              <span>
                {p.USER_NM}
                {p.USE_TP === "N" && <StatusTag kind="block">사용 안 함</StatusTag>}
              </span>
              <small>
                {p.DEPT_NM ?? "부서 없음"} · 그룹 {groupsOfUser(bench, p.USER_ID).length}개
              </small>
            </button>
            {on && <span className="pb-pick__go">›</span>}
          </div>
        );
      })}
      {!list.length && <span className="pb-empty-note">찾는 사람이 없습니다.</span>}
    </Panel>
  );
});
