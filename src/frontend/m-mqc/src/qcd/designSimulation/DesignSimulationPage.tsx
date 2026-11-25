"use client";

/**
 * 시뮬레이션(designSimulation) — 주문 한 건을 6단계 기준 파이프라인(입력 검증 → 주문정합성 → 주문단중 → 생산가부 → 품질사양 매칭 → 설계값 산출)에
 * 통과시키는 회귀 시험 화면. 케이스마다 주문·핀(설계값 기대)·단계 기대·골든 스냅샷을 두고, 실행 결과와 대조한다.
 * 왼쪽: 케이스 목록·주문 입력 / 가운데: 동작 줄·단계 띠·단계 상세·기대값 대조 / 오른쪽: 근거 추적·이상징후.
 * 파이프라인은 품질설계결과와 같은 서버 계산(Maru 룰)이다. 단계가 막혀도 멈추지 않고 뒤 단계는 참고값으로 표시한다.
 */
import { useCallback, useMemo, useRef, useState } from "react";

import type { PageProps } from "@dk-oasis/shared/portal-shell-core";
import { ContentBody, ContentPanel, PageLayout, SearchArea, SearchField, type PageButton } from "@dk-oasis/shared/layout";
import { Badge, Input } from "@dk-oasis/shared/form";
import { useMessage } from "@dk-oasis/shared/message-provider";

import { errorMessage } from "@/common/oasis";
import { screenMeta } from "@/common/screens";
import { searchOrders, viewOrder } from "@/qdr/qualityDesignResult/api";
import { DesignStyle } from "@/qdr/qualityDesignResult/design-css";
import { fmtThk, fmtWid } from "@/qdr/qualityDesignResult/format";
import { StageStrip } from "@/qdr/qualityDesignResult/RunWidgets";
import type { PipelineRun, ValueTrace } from "@/qdr/qualityDesignResult/types";

import { applyGolden, deleteCase, runCase, saveCase, searchCases, viewCase } from "./api";
import { CaseListPanel } from "./CaseListPanel";
import { ExpectPanel } from "./ExpectPanel";
import { CASE_STATUS_TONE, dirtyFields, expectScore, newCaseName, orderKeyOf, pinLabelOf, removePin, tracesFor, upsertPin } from "./logic";
import { OrderForm, type OrderOption } from "./OrderForm";
import { StagePanel } from "./StagePanel";
import { TracePanel } from "./TracePanel";
import {
  CASE_STATUS_LABEL,
  SCREEN_ID,
  type CaseEval,
  type CaseRow,
  type CaseRunResult,
  type CaseViewResult,
  type OrderFields,
  type Pin,
  type SimCase,
} from "./types";

/** 케이스 응답 → 목록 행. */
export function caseRowOf(c: SimCase): CaseRow {
  return {
    caseId: c.caseId,
    caseNm: c.caseNm,
    baseOrdRef: c.baseOrdRef,
    status: c.status,
    statusNm: c.statusNm,
    lastRunAt: c.lastRunAt,
    pinTotal: c.pins?.length ?? 0,
    verdictTotal: c.verdicts?.length ?? 0,
    hasGolden: c.hasGolden,
    author: c.author,
  };
}

function mergeRow(rows: CaseRow[], c: SimCase): CaseRow[] {
  const row = caseRowOf(c);
  return rows.some((r) => r.caseId === c.caseId) ? rows.map((r) => (r.caseId === c.caseId ? row : r)) : [...rows, row];
}

export function DesignSimulationPage(_props: PageProps) {
  const meta = screenMeta(SCREEN_ID);
  const { showMessage } = useMessage();
  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<CaseRow[]>([]);
  const [listLoading, setListLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [view, setView] = useState<CaseViewResult | null>(null);
  const [draft, setDraft] = useState<OrderFields>({});
  const [baseOrdRef, setBaseOrdRef] = useState<string | null>(null);
  const [caseNm, setCaseNm] = useState("");
  const [source, setSource] = useState<"oms" | "manual">("oms");
  const [run, setRun] = useState<PipelineRun | null>(null);
  const [ev, setEv] = useState<CaseEval | null>(null);
  const [stageNo, setStageNo] = useState(6);
  const [picked, setPicked] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [orderOptions, setOrderOptions] = useState<OrderOption[]>([]);
  const seq = useRef(0);
  const selectedRef = useRef<string | null>(null);

  const fail = useCallback((e: unknown) => showMessage({ title: "오류", message: errorMessage(e), alertType: "error" }), [showMessage]);

  const sim = view?.case ?? null;
  const dirty = useMemo(() => (sim ? dirtyFields(draft, sim.order) : []), [draft, sim]);

  const applyRun = useCallback((out: CaseRunResult) => {
    setRun(out.run);
    setEv(out.eval);
    setView((v) => (v && v.case.caseId === out.case.caseId ? { ...v, case: out.case } : v));
    setRows((rs) => mergeRow(rs, out.case));
  }, []);

  /** 케이스를 열고 저장된 주문으로 실행한다. */
  const openCase = useCallback(
    async (caseId: string) => {
      selectedRef.current = caseId;
      setSelectedId(caseId);
      const my = ++seq.current;
      setBusy(true);
      try {
        const v = await viewCase(caseId);
        if (my !== seq.current) return;
        setView(v);
        setDraft(v.case.order ?? {});
        setBaseOrdRef(v.case.baseOrdRef);
        setCaseNm(v.case.caseNm);
        setSource("oms");
        setEv(v.case.lastEval);
        setRun(null);
        setPicked(null);
        const out = await runCase(caseId);
        if (my !== seq.current) return;
        applyRun(out);
      } catch (e) {
        if (my === seq.current) fail(e);
      } finally {
        if (my === seq.current) setBusy(false);
      }
    },
    [applyRun, fail],
  );

  const loadOrderOptions = useCallback(async () => {
    try {
      const out = await searchOrders(undefined, undefined, 200);
      setOrderOptions(
        (out.rows ?? []).map((o) => ({
          value: o.orderKey,
          label: `${o.orderKey} · ${o.prdLabel} · ${o.spcAvr} · ${fmtThk(o.thk)}×${fmtWid(o.wid)}`,
        })),
      );
    } catch (e) {
      fail(e);
    }
  }, [fail]);

  const handleSearch = useCallback(async () => {
    setListLoading(true);
    if (orderOptions.length === 0) void loadOrderOptions();
    try {
      const out = await searchCases(keyword);
      const list = out.rows ?? [];
      setRows(list);
      const keep = list.find((r) => r.caseId === selectedRef.current);
      if (!keep && list[0]) void openCase(list[0].caseId);
      if (!list.length) {
        selectedRef.current = null;
        setSelectedId(null);
        setView(null);
        setRun(null);
        setEv(null);
      }
    } catch (e) {
      fail(e);
    } finally {
      setListLoading(false);
    }
  }, [keyword, orderOptions.length, loadOrderOptions, openCase, fail]);

  /** 실행 — 고친 항목이 있으면 고친 주문으로(저장하지 않는다). */
  const doRun = useCallback(
    async (order?: OrderFields | null) => {
      const id = selectedRef.current;
      if (!id) return;
      const my = ++seq.current;
      setBusy(true);
      try {
        const out = await runCase(id, order ?? null);
        if (my === seq.current) applyRun(out);
      } catch (e) {
        if (my === seq.current) fail(e);
      } finally {
        if (my === seq.current) setBusy(false);
      }
    },
    [applyRun, fail],
  );

  const handleRun = () => void doRun(dirty.length ? draft : null);

  const handleRunAll = async () => {
    if (!rows.length) return;
    const my = ++seq.current;
    setBusy(true);
    try {
      let current: CaseRunResult | null = null;
      for (const r of rows) {
        const out = await runCase(r.caseId);
        setRows((rs) => mergeRow(rs, out.case));
        if (r.caseId === selectedRef.current) current = out;
      }
      if (current && my === seq.current) applyRun(current);
      showMessage({ message: `${rows.length}건을 다시 실행했습니다.`, alertType: "success", toast: true });
    } catch (e) {
      fail(e);
    } finally {
      if (my === seq.current) setBusy(false);
    }
  };

  /** 저장 — 주문·이름·핀·단계 기대. pins 를 주면 그것으로 저장한다. 저장한 뒤 다시 실행한다. */
  const doSave = useCallback(
    async (pins?: Pin[], message = "저장되었습니다.") => {
      if (!sim) return;
      if (!caseNm.trim()) {
        showMessage({ message: "케이스 이름을 입력하세요.", alertType: "warning" });
        return;
      }
      setBusy(true);
      try {
        const v = await saveCase({
          caseId: sim.caseId,
          caseNm: caseNm.trim(),
          baseOrdRef,
          order: draft,
          pins: pins ?? sim.pins,
          verdicts: sim.verdicts,
        });
        setView(v);
        setDraft(v.case.order ?? {});
        setRows((rs) => mergeRow(rs, v.case));
        showMessage({ message, alertType: "success", toast: true });
        const out = await runCase(v.case.caseId);
        applyRun(out);
      } catch (e) {
        fail(e);
      } finally {
        setBusy(false);
      }
    },
    [sim, caseNm, baseOrdRef, draft, showMessage, applyRun, fail],
  );

  const handleNew = useCallback(async () => {
    setBusy(true);
    try {
      const key = orderKeyOf(draft);
      const v = await saveCase({ caseId: null, caseNm: newCaseName(key), baseOrdRef: baseOrdRef ?? key, order: draft, pins: [], verdicts: [] });
      setRows((rs) => mergeRow(rs, v.case));
      showMessage({ message: `${v.case.caseId} 케이스를 만들었습니다.`, alertType: "success", toast: true });
      setBusy(false);
      await openCase(v.case.caseId);
    } catch (e) {
      fail(e);
      setBusy(false);
    }
  }, [draft, baseOrdRef, showMessage, openCase, fail]);

  const handleApply = () =>
    showMessage({
      title: "확인",
      message: "현재 설계결과를 골든으로 채택하시겠습니까? 이후 실행은 이 결과와 비교합니다.",
      alertType: "confirm",
      onConfirm: async () => {
        const id = selectedRef.current;
        if (!id) return;
        setBusy(true);
        try {
          applyRun(await applyGolden(id, dirty.length ? draft : null));
          showMessage({ message: "골든으로 채택했습니다.", alertType: "success", toast: true });
        } catch (e) {
          fail(e);
        } finally {
          setBusy(false);
        }
      },
    });

  const handleDelete = () =>
    showMessage({
      title: "확인",
      message: "선택한 케이스를 삭제하시겠습니까?",
      alertType: "confirm",
      onConfirm: async () => {
        const id = selectedRef.current;
        if (!id) return;
        setBusy(true);
        try {
          await deleteCase(id);
          selectedRef.current = null;
          setSelectedId(null);
          setView(null);
          setRun(null);
          setEv(null);
          showMessage({ message: "삭제되었습니다.", alertType: "success", toast: true });
          setBusy(false);
          await handleSearch();
        } catch (e) {
          fail(e);
          setBusy(false);
        }
      },
    });

  const onChangeField = useCallback((field: string, value: string) => {
    setDraft((p) => ({ ...p, [field]: value }));
    setSource("manual");
  }, []);

  const onLoadOrder = useCallback(
    async (orderKey: string) => {
      try {
        const out = await viewOrder(orderKey);
        setDraft(out.fields ?? {});
        setBaseOrdRef(orderKey);
        setSource("oms");
        await doRun(out.fields ?? {});
      } catch (e) {
        fail(e);
      }
    },
    [doRun, fail],
  );

  const onPick = useCallback((path: string) => setPicked(path), []);
  const onPin = useCallback(
    (t: ValueTrace) => {
      if (!sim) return;
      const pins = upsertPin(sim.pins ?? [], { path: t.path, label: t.label || pinLabelOf(t.path), op: "=", val: t.value ?? "" });
      void doSave(pins, "핀을 더했습니다.");
    },
    [sim, doSave],
  );
  const onRemovePin = useCallback(
    (path: string) => {
      if (!sim) return;
      void doSave(removePin(sim.pins ?? [], path), "핀을 지웠습니다.");
    },
    [sim, doSave],
  );

  const traces = useMemo(() => tracesFor(run?.design?.trace, picked), [run, picked]);
  const pinnedPaths = useMemo(() => new Set((sim?.pins ?? []).map((p) => p.path)), [sim]);
  const stage = run?.stages?.find((s) => s.no === stageNo) ?? run?.stages?.[0] ?? null;
  const score = expectScore(ev);
  const status = ev?.status ?? sim?.status ?? "NOT_RUN";
  const statusNm = ev?.statusNm ?? sim?.statusNm ?? CASE_STATUS_LABEL[status];
  const anomalies = run?.anomalies ?? [];
  const errorCount = anomalies.filter((a) => a.severity === "error").length;
  const warnCount = anomalies.filter((a) => a.severity === "warn").length;
  const infoCount = anomalies.filter((a) => a.severity === "info").length;

  const hasCase = !!sim && !busy;
  const buttons: PageButton[] = [
    { id: "btn_search", label: "조회", onClick: () => void handleSearch(), type: "primary", disabled: listLoading || busy, action: "search" },
    { id: "btn_new", label: "신규", onClick: () => void handleNew(), disabled: busy, action: "save" },
    { id: "btn_save", label: "저장", onClick: () => void doSave(), type: "save", disabled: !hasCase, action: "save" },
    { id: "btn_delete", label: "삭제", onClick: handleDelete, disabled: !hasCase, action: "delete" },
    { id: "btn_apply", label: "골든 채택", onClick: handleApply, disabled: !hasCase || !run, action: "apply" },
    { id: "btn_run", label: "▶ 실행", onClick: handleRun, type: "primary", disabled: !hasCase, action: "run" },
  ];

  return (
    <PageLayout title={meta.title} breadcrumb={meta.breadcrumb} screenId={SCREEN_ID} objId={SCREEN_ID} buttons={buttons}>
      <DesignStyle />
      <SearchArea onSearch={() => void handleSearch()} autoSearch>
        <SearchField label="케이스·주문번호" defaultKey="keyword" value={keyword} onChange={setKeyword} placeholder="케이스 ID·이름·주문번호" />
      </SearchArea>
      <ContentBody root resizable storageKey="mqc.qcd.designSimulation">
        <ContentBody direction="column" resizable width={300} minSize={220}>
          <ContentPanel height="40%">
            <CaseListPanel
              rows={rows}
              loading={listLoading}
              selectedId={selectedId}
              busy={busy}
              onSelect={(id) => {
                if (id !== selectedRef.current) void openCase(id);
              }}
              onNew={() => void handleNew()}
              onRunAll={() => void handleRunAll()}
            />
          </ContentPanel>
          <ContentPanel scrollY>
            {sim ? (
              <OrderForm
                order={draft}
                labels={view?.labels ?? {}}
                coreFields={view?.coreFields ?? []}
                requiredFields={view?.requiredFields ?? []}
                dirty={dirty}
                source={source}
                orderOptions={orderOptions}
                disabled={busy}
                onChange={onChangeField}
                onLoadOrder={(k) => void onLoadOrder(k)}
              />
            ) : (
              <div className="mqc-qd-muted">케이스를 고르세요.</div>
            )}
          </ContentPanel>
        </ContentBody>
        <ContentPanel scrollY>
          {sim ? (
            <div className="mqc-qd-pane" aria-busy={busy}>
              <div className="mqc-qd-head">
                <b className="mqc-qd-mono">{sim.caseId}</b>
                <Input value={caseNm} onChange={setCaseNm} aria-label="케이스 이름" disabled={busy} />
                <Badge label={statusNm} tone={CASE_STATUS_TONE[status] ?? "neutral"} />
                {errorCount ? <Badge label={`이상 ${errorCount}`} tone="danger" /> : null}
                {warnCount ? <Badge label={`경고 ${warnCount}`} tone="warning" /> : null}
                {infoCount ? <Badge label={`참고 ${infoCount}`} /> : null}
                <Badge label={`기대값 ${score.pass}/${score.total}`} tone={score.pass === score.total ? "success" : "danger"} />
                {ev?.goldenAt ? (
                  <Badge label={`골든 diff ${ev.goldenDiff?.length ?? 0}`} tone={ev.goldenDiff?.length ? "danger" : "success"} />
                ) : (
                  <Badge label="골든 없음" />
                )}
                {dirty.length ? <Badge label={`고친 항목 ${dirty.length} · 미저장`} tone="warning" /> : null}
              </div>
              {run ? (
                <>
                  <div className="mqc-qd-muted">
                    기준 출처: {run.source?.label ?? "-"}
                    {run.source?.note ? ` · ${run.source.note}` : ""} · 평가 {run.evalTs}
                    {run.mainLine ? ` · 주공정 ${run.mainLine}` : ""} · 주문 {run.orderKey}
                  </div>
                  <StageStrip stages={run.stages ?? []} active={stage?.no} onSelect={setStageNo} />
                  {stage ? <StagePanel run={run} stage={stage} picked={picked} onPick={onPick} /> : null}
                </>
              ) : (
                <div className="mqc-qd-muted">{busy ? "실행 중입니다." : "아직 실행하지 않았습니다 — 「▶ 실행」 을 누르세요."}</div>
              )}
              <ExpectPanel pins={sim.pins ?? []} verdicts={sim.verdicts ?? []} ev={ev} busy={busy} onRemovePin={onRemovePin} />
            </div>
          ) : (
            <div className="mqc-qd-muted">왼쪽 목록에서 케이스를 고르세요.</div>
          )}
        </ContentPanel>
        <ContentPanel width={320} minSize={240} scrollY>
          <TracePanel path={picked} traces={traces} anomalies={anomalies} pinned={pinnedPaths} busy={busy} onPin={onPin} />
        </ContentPanel>
      </ContentBody>
    </PageLayout>
  );
}
