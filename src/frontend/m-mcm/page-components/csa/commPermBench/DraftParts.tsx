"use client";

/**
 * 초안 막대·초안 영향(2단계 f3) — 시안 render() 의 막대와 simBlock(imp).
 * - DraftBar: 바꾼 것 수·영향 사람 수·저장 상태·충돌 안내 + 이력·초안 버리기·초안 적용
 * - ImpactBlock: 타일(바꾼 것·얻는 사람·잃는 사람·화면) + 바꾼 것 목록(× 되돌리기) + 영향받는 사람(그리드, 이름을 누르면 그 사람 기준)
 */
import { memo, useCallback, useMemo } from "react";
import { IconHistory, IconX } from "@tabler/icons-react";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Button } from "@dk-oasis/shared/form";
import type { ImpactResult, PermChangeOp } from "./types";
import { fmtNum, type RolePermMap } from "./model";
import { changeText, conflictText, impactPeople, keyOf, permBaseOf, type ChangeNames, type DraftMap, type ImpactPerson } from "./draft";
import type { DraftStatus } from "./useBenchDraft";
import { useBench } from "./parts";

/** 서버 시각(「yyyy-MM-dd HH:mm:ss」 또는 ISO 「…T…」) → 「11-27 14:05:09」. */
export function fmtTime(iso: string | null): string {
  if (!iso) return "";
  const m = /^(\d{4})-(\d{2})-(\d{2})[T ](\d{2}):(\d{2}):(\d{2})/.exec(iso);
  if (!m) return iso;
  // 서버가 「Z」 붙은 UTC 로 주면 보는 사람의 시각으로 바꾼다
  if (/Z$|[+-]\d{2}:?\d{2}$/.test(iso)) {
    const d = new Date(iso);
    if (!Number.isNaN(d.getTime())) {
      const p = (n: number) => String(n).padStart(2, "0");
      return `${p(d.getMonth() + 1)}-${p(d.getDate())} ${p(d.getHours())}:${p(d.getMinutes())}:${p(d.getSeconds())}`;
    }
  }
  return `${m[2]}-${m[3]} ${m[4]}:${m[5]}:${m[6]}`;
}

export interface DraftBarProps {
  status: DraftStatus;
  /** 화면 초안 줄 수(저장 전 포함). */
  count: number;
  savedAt: string | null;
  dirty: boolean;
  saving: boolean;
  saveError: string | null;
  impact: ImpactResult | null;
  impactLoading: boolean;
  /** 충돌 범위 이름(PERM_CONFLICT 뒤). 없으면 null. */
  conflict: string[] | null;
  onDiscard: () => void;
  onApply: () => void;
  onHistory: () => void;
  onRetrySave: () => void;
  onReloadDraft: () => void;
  onReloadCur: () => void;
}

export const DraftBar = memo(function DraftBar(p: DraftBarProps) {
  const sum = p.impact?.summary[0];
  const ready = p.status === "ready";
  const busy = p.saving || p.dirty;
  return (
    <div className="pb-bar pb-draftbar" role="region" aria-label="초안">
      <span className="pb-dtag">초안</span>
      {p.status === "loading" && <span className="pb-muted">저장된 초안을 읽는 중입니다.</span>}
      {p.status === "failed" && (
        <span className="pb-err" role="alert">
          저장된 초안을 읽지 못했습니다. 읽기 전에는 고칠 수 없습니다.{" "}
          <Button size="mini" onClick={p.onReloadDraft}>
            다시 읽기
          </Button>
        </span>
      )}
      {p.status === "corrupt" && (
        <span className="pb-err" role="alert">
          저장된 초안이 깨졌거나 지금 현재 값과 맞지 않습니다. 초안을 버리고 다시 만들어 주세요.{" "}
          <Button size="mini" variant="danger" onClick={p.onDiscard}>
            초안 버리기
          </Button>
        </span>
      )}
      {ready &&
        (p.count ? (
          <span>
            바꾼 것 <b>{fmtNum(p.count)}</b>건
            {sum && !busy && (
              <>
                {" "}
                · 영향 <span className="pb-pm"><b className="pb-p">얻는 사람 {fmtNum(sum.GAIN_USER_CNT)}</b> <b className="pb-m">잃는 사람 {fmtNum(sum.LOSE_USER_CNT)}</b></span> · 화면 {fmtNum(sum.SCREEN_CNT)}개
              </>
            )}
            {(p.impactLoading || busy) && <span className="pb-muted"> · 영향 계산 중</span>}
          </span>
        ) : (
          <span className="pb-muted">바꾼 것 없음 — 지금 보이는 값이 현재 값입니다</span>
        ))}
      {ready && (
        <span className="pb-small pb-muted" role="status">
          {p.saving ? "저장 중…" : p.dirty && !p.saveError ? "저장 대기" : p.savedAt ? `마지막 저장 ${fmtTime(p.savedAt)}` : ""}
        </span>
      )}
      {p.saveError && ready && (
        <span className="pb-err" role="alert">
          초안을 저장하지 못했습니다. {p.saveError}{" "}
          <Button size="mini" onClick={p.onRetrySave}>
            다시 저장
          </Button>
        </span>
      )}
      {p.conflict && (
        <span className="pb-err" role="alert">
          {conflictText(p.conflict)}{" "}
          <Button size="mini" onClick={p.onReloadCur}>
            현재 값 다시 읽기
          </Button>
        </span>
      )}
      <span className="pb-sp" />
      <Button size="mini" onClick={p.onHistory} title="적용 이력 — 누가, 언제, 무엇을, 몇 명에게">
        <IconHistory size={14} aria-hidden /> 이력
      </Button>
      <Button size="mini" disabled={!ready || !p.count} onClick={p.onDiscard}>
        초안 버리기
      </Button>
      <Button size="mini" variant="primary" disabled={!ready || !p.count || !!p.saveError} onClick={p.onApply}>
        초안 적용
      </Button>
    </div>
  );
});

const PEOPLE_COLUMNS: GridColumn[] = [
  {
    key: "USER_NM", header: "사람", width: 120, sortable: false, filter: false, meta: false,
    render: (_v, r) => {
      const p = r as ImpactPerson;
      return (
        <span>
          {p.USER_NM} <span className="pb-mono pb-faint">{p.USER_ID}</span>
        </span>
      );
    },
  },
  { key: "GAIN_TXT", header: "얻음", width: 220, sortable: false, filter: false, meta: false, render: (v) => <span className="pb-p">{String(v ?? "")}</span> },
  { key: "LOSE_TXT", header: "잃음", width: 220, sortable: false, filter: false, meta: false, render: (v) => <span className="pb-m">{String(v ?? "")}</span> },
];

export interface ImpactBlockProps {
  changes: DraftMap;
  impact: ImpactResult | null;
  impactLoading: boolean;
  /** 저장 대기·저장 중(영향은 저장한 초안으로 센다). */
  pending: boolean;
  canEdit: boolean;
  /** 현재 값 퍼미션(바꾼 것 글의 「전」 값·화면 이름). */
  basePerms: ReadonlyMap<string, RolePermMap>;
  userId: string | null;
  onRevert: (key: string) => void;
  onSelectUser: (userId: string) => void;
}

interface ChangeItem {
  key: string;
  op: PermChangeOp;
  text: string;
}

/**
 * 바꾼 것 목록. 따로 memo 해 저장 상태(pending·impactLoading)만 바뀔 때는 다시 그리지 않는다
 * (모듈 일괄 등록 뒤 줄 약 1,000개, f3 리뷰 9). list 는 ImpactBlock 이 초안·현재 값이 바뀔 때만 새로 만든다.
 */
const ChangeList = memo(function ChangeList({ list, canEdit, onRevert }: { list: readonly ChangeItem[]; canEdit: boolean; onRevert: (key: string) => void }) {
  return (
    <ul className="pb-chlist">
      {list.map((c) => (
        <li key={c.key}>
          <span className={`pb-st ${c.op === "ADD" ? "add" : c.op === "DEL" ? "del" : "mod"}`}>{c.op === "ADD" ? "더함" : c.op === "DEL" ? "뺌" : "바꿈"}</span>
          <span>{c.text}</span>
          <button type="button" className="pb-x" aria-label={`되돌리기: ${c.text}`} title="되돌리기" disabled={!canEdit} onClick={() => onRevert(c.key)}>
            <IconX size={14} aria-hidden />
          </button>
        </li>
      ))}
    </ul>
  );
});

export const ImpactBlock = memo(function ImpactBlock(p: ImpactBlockProps) {
  const { base } = useBench();
  const { basePerms, changes, impact, onSelectUser } = p;
  const names = useMemo<ChangeNames>(
    () => ({
      user: (id) => base.userById.get(id)?.USER_NM ?? id,
      group: (id) => base.groupById.get(id)?.ROLE_GROUP_NM ?? id,
      role: (id) => base.roleById.get(id)?.ROLE_NM ?? id,
      object: (id) => {
        for (const m of basePerms.values()) {
          const row = m.get(id);
          if (row) return row.OBJECT_NM;
        }
        return id;
      },
    }),
    [base, basePerms],
  );
  const list = useMemo<ChangeItem[]>(
    () =>
      [...changes.values()].map((c) => {
        const m = c.TP === "ROLE_OBJ" ? basePerms.get(c.KEY1) : undefined;
        return { key: keyOf(c), op: c.OP, text: changeText(c, names, m ? permBaseOf(m.get(c.KEY2)) : undefined) };
      }),
    [changes, basePerms, names],
  );
  const people = useMemo(() => impactPeople(impact?.impacts ?? []), [impact]);
  const onRow = useCallback((r: Record<string, unknown>) => onSelectUser(String(r.USER_ID)), [onSelectUser]);
  const sum = impact?.summary[0];
  const counting = p.pending || p.impactLoading;

  if (!changes.size) {
    return (
      <div className="pb-pad pb-stack pb-draftstrip">
        <h4 className="pb-sub">
          초안 영향 <span className="pb-small pb-muted">초안을 적용하면 생기는 일 · 이 사람 밖의 영향까지</span>
        </h4>
        <div className="pb-empty-note">
          아직 초안에 바꾼 것이 없습니다. 왼쪽 칸의 체크나 화면 안 퍼미션의 칩으로 고치면 여기에 영향이 나옵니다.
        </div>
      </div>
    );
  }
  return (
    <div className="pb-pad pb-stack pb-draftstrip">
      <h4 className="pb-sub">
        초안 영향 <span className="pb-small pb-muted">초안을 적용하면 생기는 일 · 이 사람 밖의 영향까지{counting ? " · 저장한 뒤 다시 셉니다" : ""}</span>
      </h4>
      <div className="pb-tiles">
        <div>
          <b>{fmtNum(changes.size)}</b>
          <span>바꾼 것</span>
        </div>
        <div className="pb-p">
          <b>{sum && !counting ? fmtNum(sum.GAIN_USER_CNT) : "…"}</b>
          <span>얻는 사람</span>
        </div>
        <div className="pb-m">
          <b>{sum && !counting ? fmtNum(sum.LOSE_USER_CNT) : "…"}</b>
          <span>잃는 사람</span>
        </div>
        <div>
          <b>{sum && !counting ? fmtNum(sum.SCREEN_CNT) : "…"}</b>
          <span>바뀌는 화면</span>
        </div>
      </div>
      <h4 className="pb-sub">
        바꾼 것 <span className="pb-small pb-muted">× 로 하나씩 되돌립니다</span>
      </h4>
      <ChangeList list={list} canEdit={p.canEdit} onRevert={p.onRevert} />
      <h4 className="pb-sub">
        영향받는 사람 <span className="pb-small pb-muted">이름을 누르면 그 사람 기준으로 확인합니다{impact && impact.impacts.length >= 500 ? " · 앞 500줄(사람 × 화면)만 받았습니다" : ""}</span>
      </h4>
      <AgDataGrid
        title="영향받는 사람"
        ariaLabel="영향받는 사람"
        columns={PEOPLE_COLUMNS}
        data={people}
        rowKey="USER_ID"
        height={260}
        columnSizing="fit"
        sortable={false}
        personalize={false}
        loading={counting && !impact}
        highlightedRowKey={p.userId}
        onRowClick={onRow}
        publishScreenContext={false}
      />
    </div>
  );
});
