"use client";

/**
 * 초안 적용 창·적용 이력 창(2단계 f3).
 * - ApplyModal: 메모를 받아 적용한다. 서버가 PERM_NEED_CONFIRM(버튼을 잃는 사람 있음)으로 막으면 잃는 사람 수와 앞 몇 명을 보이고
 *   「잃는 사람이 있어도 적용」(confirmLoss = Y)으로 다시 보낸다.
 * - HistoryModal: searchHistory 목록(기간 기본 오늘 − 30일 ~ 오늘, 최대 366일·500줄) + 고른 적용의 searchHistoryDtl 줄.
 *   시안에 자리가 없어 초안 막대 「이력」 단추로 연다.
 * 창 안 입력(메모)은 창 안 상태 — 한 글자마다 화면 루트를 다시 그리지 않는다.
 */
import { memo, useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Modal } from "@dk-oasis/shared/modal";
import { AgDataGrid, type GridColumn } from "@dk-oasis/shared/grid";
import { Button, DateRangePicker, Textarea } from "@dk-oasis/shared/form";
import type { HistoryDtlRow, HistoryRow, ImpactResult, PermBenchApi, YN } from "./types";
import { fmtNum, type BenchIndex } from "./model";
import { HISTORY_MAX_DAYS, HISTORY_MAX_ROWS, benchErrorText, defaultHistoryRange, historyRangeError, impactPeople } from "./draft";
import { fmtTime } from "./DraftParts";

/** onApply 결과: done = 끝(창 닫음) · confirm = 잃는 사람 확인이 필요 · error = 실패(창 유지, 화면이 메시지를 보였다). */
export type ApplyOutcome = { kind: "done" } | { kind: "confirm"; message: string } | { kind: "error" };

const LOSS_PREVIEW = 8;

export const ApplyModal = memo(function ApplyModal({ count, impact, impactLoading, onClose, onApply }: {
  count: number;
  impact: ImpactResult | null;
  /** 영향을 다시 세는 중(저장 뒤 impact 응답 전) — 앞 초안의 수·명단을 보이지 않는다(f3 리뷰 10). */
  impactLoading: boolean;
  onClose: () => void;
  onApply: (memo: string, confirmLoss: YN) => Promise<ApplyOutcome>;
}) {
  const [memo, setMemo] = useState("");
  const [confirm, setConfirm] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const sum = impact?.summary[0];
  const losers = useMemo(() => impactPeople(impact?.impacts ?? []).filter((x) => x.LOSE_CNT > 0), [impact]);

  const run = async (confirmLoss: YN) => {
    setBusy(true);
    const r = await onApply(memo.trim(), confirmLoss);
    setBusy(false);
    if (r.kind === "confirm") setConfirm(r.message);
    else if (r.kind === "done") onClose();
  };

  const footer = confirm ? (
    <>
      <Button onClick={onClose} disabled={busy}>
        취소
      </Button>
      <Button variant="danger" onClick={() => void run("Y")} disabled={busy}>
        잃는 사람이 있어도 적용
      </Button>
    </>
  ) : (
    <>
      <Button onClick={onClose} disabled={busy}>
        취소
      </Button>
      <Button variant="primary" onClick={() => void run("N")} disabled={busy}>
        적용
      </Button>
    </>
  );

  return (
    <Modal open title="초안 적용" size="md" onClose={busy ? undefined : onClose} footer={footer}>
      <div className="pb-stack">
        {!confirm ? (
          <>
            <p className="pb-small" style={{ margin: 0 }}>
              초안 <b>{fmtNum(count)}</b>건을 현재 값으로 적용합니다. 한 번에 적용하고, 다른 관리자가 먼저 바꾼 범위가 있으면 적용하지 않습니다.
            </p>
            {impactLoading ? (
              <p className="pb-small pb-muted" style={{ margin: 0 }} role="status">
                얻는 사람·잃는 사람을 계산 중입니다.
              </p>
            ) : sum && (
              <p className="pb-small" style={{ margin: 0 }}>
                얻는 사람 <b className="pb-p">{fmtNum(sum.GAIN_USER_CNT)}</b>명 · 잃는 사람 <b className="pb-m">{fmtNum(sum.LOSE_USER_CNT)}</b>명 · 바뀌는 화면{" "}
                {fmtNum(sum.SCREEN_CNT)}개
              </p>
            )}
            <Textarea value={memo} onChange={setMemo} rows={3} maxLength={1000} placeholder="적용 메모(이력에 남습니다)" aria-label="적용 메모" />
          </>
        ) : (
          <>
            <p className="pb-small" style={{ margin: 0 }} role="alert">
              <b className="pb-m">{impactLoading ? "버튼을 잃는 사람이 있습니다." : `버튼을 잃는 사람이 ${fmtNum(sum?.LOSE_USER_CNT ?? losers.length)}명 있습니다.`}</b> 한 번 더 확인합니다.{" "}
              <span className="pb-muted">({confirm})</span>
            </p>
            {impactLoading && <p className="pb-small pb-muted" style={{ margin: 0 }} role="status">잃는 사람 명단을 계산 중입니다.</p>}
            {!impactLoading && losers.length > 0 && (
              <ul className="pb-chlist">
                {losers.slice(0, LOSS_PREVIEW).map((x) => (
                  <li key={x.USER_ID}>
                    <span>
                      <b>{x.USER_NM}</b> <span className="pb-m">{x.LOSE_TXT}</span>
                    </span>
                  </li>
                ))}
                {losers.length > LOSS_PREVIEW && <li className="pb-muted">외 {fmtNum(losers.length - LOSS_PREVIEW)}명</li>}
              </ul>
            )}
          </>
        )}
      </div>
    </Modal>
  );
});

const TP_TEXT: Record<string, string> = { USER_GRP: "사람 ↔ 그룹", GRP_ROLE: "그룹 ↔ 역할", ROLE_OBJ: "퍼미션" };
const OP_TEXT: Record<string, string> = { ADD: "더함", DEL: "뺌", UPD: "바꿈" };

const HIS_COLUMNS: GridColumn[] = [
  { key: "APPLY_ID", header: "적용 ID", width: 150, meta: false },
  { key: "APPLY_USER_ID", header: "적용한 사람", width: 100, meta: false },
  { key: "APPLY_AT", header: "적용 시각", width: 120, meta: false, render: (v) => fmtTime(v == null ? null : String(v)) },
  { key: "CHANGE_CNT", header: "바꾼 것", width: 70, align: "right", meta: false },
  { key: "GAIN_USER_CNT", header: "얻는 사람", width: 80, align: "right", meta: false },
  { key: "LOSE_USER_CNT", header: "잃는 사람", width: 80, align: "right", meta: false },
  { key: "APPLY_MEMO", header: "메모", width: 220, meta: false },
];

export const HistoryModal = memo(function HistoryModal({ api, base, onClose }: { api: PermBenchApi; base: BenchIndex; onClose: () => void }) {
  // 기간(bench-be b5): 기본 = 오늘 − 30일 ~ 오늘. 창 안 상태 — 날짜를 바꿔도 화면 루트를 다시 그리지 않는다
  const [range, setRange] = useState(() => defaultHistoryRange());
  const [his, setHis] = useState<HistoryRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [applyId, setApplyId] = useState<string | null>(null);
  const [dtl, setDtl] = useState<HistoryDtlRow[]>([]);
  const [dtlLoading, setDtlLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  // 늦은 응답 버리기(f3 리뷰 11) — 요청마다 번호를 올리고, 응답 번호가 마지막 요청과 같을 때만 반영한다. 창을 닫으면 둘 다 올린다
  const hisSeq = useRef(0);
  const dtlSeq = useRef(0);

  const runSearch = useCallback(
    (fromDt: string, toDt: string) => {
      const seq = ++hisSeq.current;
      ++dtlSeq.current;
      setApplyId(null);
      setDtl([]);
      setDtlLoading(false);
      setError(null);
      setLoading(true);
      api.searchHistory({ fromDt, toDt }).then(
        (r) => {
          if (seq !== hisSeq.current) return;
          setHis(r.his);
          setLoading(false);
        },
        (e: unknown) => {
          if (seq !== hisSeq.current) return;
          setHis([]);
          setError(benchErrorText(e).message);
          setLoading(false);
        },
      );
    },
    [api],
  );

  // 처음 열 때 기본 기간으로 한 번 읽는다(응답 때만 상태를 바꾼다)
  const first = useRef(range);
  useEffect(() => {
    const seq = ++hisSeq.current;
    api.searchHistory(first.current).then(
      (r) => {
        if (seq !== hisSeq.current) return;
        setHis(r.his);
        setLoading(false);
      },
      (e: unknown) => {
        if (seq !== hisSeq.current) return;
        setError(benchErrorText(e).message);
        setLoading(false);
      },
    );
    return () => {
      hisSeq.current += 1;
      dtlSeq.current += 1;
    };
  }, [api]);

  const rangeError = historyRangeError(range.fromDt, range.toDt);
  const onRange = useCallback((fromDt: string, toDt: string) => setRange({ fromDt, toDt }), []);
  const onSearch = useCallback(() => {
    // 보내기 전에 화면에서 먼저 검사한다(형식·시작 ≤ 종료·366일). 서버도 같은 규칙으로 PERM_BAD_VALUE 를 준다
    if (historyRangeError(range.fromDt, range.toDt)) return;
    runSearch(range.fromDt, range.toDt);
  }, [range, runSearch]);

  const onRow = useCallback(
    (r: Record<string, unknown>) => {
      const id = String(r.APPLY_ID);
      const seq = ++dtlSeq.current;
      setApplyId(id);
      setDtlLoading(true);
      api.searchHistoryDtl({ applyId: id }).then(
        (res) => {
          if (seq !== dtlSeq.current) return;
          setDtl(res.dtl);
          setDtlLoading(false);
        },
        (e: unknown) => {
          if (seq !== dtlSeq.current) return;
          setDtl([]);
          setError(benchErrorText(e).message);
          setDtlLoading(false);
        },
      );
    },
    [api],
  );

  const dtlColumns = useMemo<GridColumn[]>(() => {
    const nm = (tp: string, which: 1 | 2, id: string) => {
      const kind = tp === "USER_GRP" ? (which === 1 ? "u" : "g") : tp === "GRP_ROLE" ? (which === 1 ? "g" : "r") : which === 1 ? "r" : "o";
      const n = kind === "u" ? base.userById.get(id)?.USER_NM : kind === "g" ? base.groupById.get(id)?.ROLE_GROUP_NM : kind === "r" ? base.roleById.get(id)?.ROLE_NM : undefined;
      return n ? `${n} (${id})` : id;
    };
    return [
      { key: "SEQ_NO", header: "순번", width: 56, align: "right", meta: false },
      { key: "TARGET_TP", header: "종류", width: 100, meta: false, render: (v) => TP_TEXT[String(v)] ?? String(v) },
      { key: "OP_TP", header: "작업", width: 60, meta: false, render: (v) => OP_TEXT[String(v)] ?? String(v) },
      { key: "KEY1", header: "대상 1", width: 160, meta: false, render: (v, r) => nm(String(r.TARGET_TP), 1, String(v)) },
      { key: "KEY2", header: "대상 2", width: 160, meta: false, render: (v, r) => nm(String(r.TARGET_TP), 2, String(v)) },
      { key: "BEFORE_VAL", header: "전 값", width: 160, meta: false },
      { key: "AFTER_VAL", header: "뒤 값", width: 160, meta: false },
    ];
  }, [base]);

  return (
    <Modal open title="적용 이력" size="xl" onClose={onClose} closeOnClickOutside footer={<Button onClick={onClose}>닫기</Button>}>
      <div className="pb-stack">
        <div className="pb-hisq">
          <span className="pb-small">적용 기간</span>
          <DateRangePicker from={range.fromDt} to={range.toDt} onChange={onRange} fromAriaLabel="적용 기간 시작일" toAriaLabel="적용 기간 종료일" />
          <Button size="mini" variant="primary" onClick={onSearch} disabled={!!rangeError || loading}>
            조회
          </Button>
          <span className="pb-small pb-muted">기간은 {HISTORY_MAX_DAYS}일까지 · 새 적용부터</span>
        </div>
        {rangeError && (
          <span className="pb-err" role="alert">
            {rangeError}
          </span>
        )}
        {error && (
          <span className="pb-err" role="alert">
            {error}
          </span>
        )}
        {!loading && his.length >= HISTORY_MAX_ROWS && (
          <span className="pb-notice" role="status">
            최근 {HISTORY_MAX_ROWS}건만 보입니다 — 기간을 좁혀 주세요.
          </span>
        )}
        <AgDataGrid title="적용" ariaLabel="적용 이력" columns={HIS_COLUMNS} data={his as unknown as Record<string, unknown>[]} rowKey="APPLY_ID" height={220} columnSizing="fit" personalize={false} loading={loading} highlightedRowKey={applyId} onRowClick={onRow} publishScreenContext={false} />
        <AgDataGrid
          title={applyId ? `바꾼 것 — ${applyId}` : "바꾼 것"}
          ariaLabel="적용 이력 줄"
          columns={dtlColumns}
          data={dtl as unknown as Record<string, unknown>[]}
          rowKey="SEQ_NO"
          height={240}
          columnSizing="fit"
          personalize={false}
          loading={dtlLoading}
          publishScreenContext={false}
        />
      </div>
    </Modal>
  );
});
