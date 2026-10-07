"use client";

/**
 * searchDefaultsSample — 조회 칸 사용자 기본값 확인용 샘플 화면(설계 2026-10-07-search-defaults-design §7.5).
 *
 * - 서버 조회는 하지 않는다. onSearch 는 아래 「조회 기록」 에 그 순간의 조건 값을 쌓는다 — 자동 조회가 기본값을 넣은 뒤 한 번만 불렸는지 바로 보인다.
 * - 영역 A: 칸 형식 전부(텍스트·select·radio·날짜·기간·children 묶기·키 없는 칸·대상 아님) + autoSearch + 초기화 버튼(btn_reset).
 * - 영역 B: defaultsScope="tab2" — A 와 같은 name 을 써도 저장 키가 섞이지 않는지. 영역 C: defaults={false}.
 * - 규칙 편집: 설정 창(단계 4) 전까지 JSON 으로 거울(브라우저 사본)에 직접 넣는다(setSearchDefaultsLocalForDev). 서버 저장도 시도할 수 있다.
 * - 「기준일 미리보기」: 상대 날짜 계산을 다른 오늘(월 경계·윤년)로 계산해 본다. 실제 넣기는 늘 오늘 기준이다.
 * - 로컬 메뉴로만 등록한다(운영 메뉴에 넣지 않는다).
 */
import { useCallback, useEffect, useRef, useState, useSyncExternalStore } from "react";

import { Button, Checkbox, DatePicker, Input, Select, Textarea } from "@dk-oasis/shared/form";
import {
  PageLayout,
  SearchArea,
  SearchField,
  getPageSearchDefaults,
  getSearchDefaultsSource,
  parseSearchDefaultRule,
  readSearchLastValues,
  resetSearchDefaults,
  resolveSearchDefault,
  saveSearchDefaults,
  setSearchDefaultsLocalForDev,
  subscribeSearch,
  subscribeSearchDefaults,
  type PageRules,
} from "@dk-oasis/shared/layout";
import { useCarryState, useCurrentUserId, useTabPage } from "@dk-oasis/shared/portal-shell";

import { SAMPLE_EDGE_RULES, SAMPLE_RULES } from "./sample-rules";

const SCREEN_ID = "searchDefaultsSample";

interface FiltersA {
  itemCd: string;
  status: string;
  kind: string;
  baseDt: string;
  fromDt: string;
  toDt: string;
  workCenter: string;
  procCd: string;
  regFromDt: string;
  regToDt: string;
  memo: string;
  remark: string;
  itemSel: string;
  includeAll: boolean;
}

const DEFAULT_A: FiltersA = {
  itemCd: "",
  status: "",
  kind: "A",
  baseDt: "",
  fromDt: "",
  toDt: "",
  workCenter: "",
  procCd: "",
  regFromDt: "",
  regToDt: "",
  memo: "",
  remark: "",
  itemSel: "",
  includeAll: false,
};

const STATUS_OPTIONS = [
  { value: "", label: "전체" },
  { value: "Y", label: "사용" },
  { value: "N", label: "미사용" },
];
const KIND_OPTIONS = [
  { value: "A", label: "일반" },
  { value: "B", label: "긴급" },
];
const PROC_OPTIONS = [
  { value: "", label: "전체" },
  { value: "P10", label: "제강" },
  { value: "P20", label: "압연" },
  { value: "P30", label: "정정" },
];

interface SearchLog {
  seq: number;
  at: string;
  area: string;
  source: string;
  values: unknown;
}

const pretty = (v: unknown) => JSON.stringify(v, null, 2);
const EMPTY_RULES: PageRules = {};
const nowText = () => new Date().toLocaleTimeString("ko-KR", { hour12: false });

export default function SearchDefaultsSamplePage() {
  const { pageId } = useTabPage();
  const userId = useCurrentUserId();

  const [a, setA] = useCarryState<FiltersA>("filtersA", DEFAULT_A);
  const setAField = useCallback(
    <K extends keyof FiltersA>(k: K, v: FiltersA[K]) => setA((p) => ({ ...p, [k]: v })),
    [setA],
  );
  const [b, setB] = useCarryState("filtersB", { itemCd: "", baseDt: "" });
  const [c, setC] = useCarryState("filtersC", { itemCd: "" });

  // 조회 기록 — 출처: 버튼(PageLayout), Enter(form submit, emitSearch 직후), 자동(autoSearch).
  const [logs, setLogs] = useState<SearchLog[]>([]);
  const seqRef = useRef(0);
  const lastEmitRef = useRef(0);
  useEffect(() => (pageId ? subscribeSearch(pageId, () => (lastEmitRef.current = Date.now())) : undefined), [pageId]);
  const log = useCallback((area: string, source: string, values: unknown) => {
    seqRef.current += 1;
    const entry = { seq: seqRef.current, at: nowText(), area, source, values };
    setLogs((prev) => [entry, ...prev].slice(0, 30));
  }, []);
  const sourceOfAreaSearch = () => (Date.now() - lastEmitRef.current < 50 ? "Enter" : "자동");

  // 저장된 규칙(저장소 구독)·마지막 조회값(조회 기록이 늘 때 다시 그려지며 읽는다).
  const pageRules = useSyncExternalStore(
    subscribeSearchDefaults,
    () => (userId && pageId ? getPageSearchDefaults(userId, pageId) : EMPTY_RULES),
    () => EMPTY_RULES,
  );
  const lastValues = userId && pageId ? readSearchLastValues(userId, pageId) : {};

  // 규칙 편집(JSON)
  const [ruleText, setRuleText] = useState("");
  const [ruleMessage, setRuleMessage] = useState("");

  // 영역 다시 열기 — key 를 바꿔 SearchArea 를 다시 마운트한다(탭을 닫았다 여는 것과 같은 넣기 흐름).
  const [areaKey, setAreaKey] = useState(0);
  const remount = () => {
    setA(DEFAULT_A);
    setB({ itemCd: "", baseDt: "" });
    setC({ itemCd: "" });
    setAreaKey((n) => n + 1);
  };

  const parseRuleText = (): PageRules | null => {
    try {
      const raw = JSON.parse(ruleText) as Record<string, unknown>;
      const out: PageRules = {};
      for (const [k, v] of Object.entries(raw)) {
        const rule = parseSearchDefaultRule(v);
        if (!rule) {
          setRuleMessage(`읽을 수 없는 규칙: ${k}`);
          return null;
        }
        out[k] = rule;
      }
      return out;
    } catch (e) {
      setRuleMessage(`JSON 오류: ${(e as Error).message}`);
      return null;
    }
  };
  const applyLocal = (rules: PageRules | null) => {
    if (!rules || !userId || !pageId) return;
    setSearchDefaultsLocalForDev(userId, pageId, rules);
    setRuleMessage(`브라우저 사본에 ${Object.keys(rules).length}개 규칙을 넣었다. [영역 다시 열기]나 탭을 다시 열면 적용된다.`);
  };
  const saveServer = async () => {
    const rules = parseRuleText();
    if (!rules || !userId || !pageId) return;
    try {
      await saveSearchDefaults(
        userId,
        pageId,
        Object.entries(rules).map(([fieldKey, rule]) => ({ fieldKey, rule })),
      );
      setRuleMessage("서버에 저장했다.");
    } catch (e) {
      setRuleMessage(`서버 저장 실패(백엔드 미반영이면 정상): ${(e as Error).message}`);
    }
  };
  const resetServer = async () => {
    if (!userId || !pageId) return;
    try {
      await resetSearchDefaults(userId, pageId);
      setRuleMessage("서버·사본에서 이 화면 규칙을 지웠다.");
    } catch (e) {
      setSearchDefaultsLocalForDev(userId, pageId, {});
      setRuleMessage(`서버 초기화 실패 — 사본만 지웠다: ${(e as Error).message}`);
    }
  };

  // 기준일 미리보기 — 영역 A 의 칸 종류로 계산한다.
  const [previewDate, setPreviewDate] = useState("");
  const preview = (() => {
    if (!previewDate) return null;
    const [y, m, d] = previewDate.split("-").map(Number);
    const now = new Date(y, m - 1, d, 12);
    const dateKeys = new Set(["baseDt", "fromDt", "fromDt~to", "regFromDt", "regFromDt~to", "tab2.baseDt"]);
    return Object.fromEntries(
      Object.entries(pageRules).map(([k, rule]) => [
        k,
        resolveSearchDefault(rule, { valueType: dateKeys.has(k) ? "date" : "text", now, lastValue: lastValues[k] }) ?? "(넣지 않음)",
      ]),
    );
  })();

  const searchA = () => log("A", "버튼", a);

  return (
    <PageLayout
      title="조회 기본값 샘플"
      breadcrumb="공통관리 > 개발 샘플 > 조회 기본값 샘플"
      screenId={SCREEN_ID}
      buttons={[
        { id: "btn_search", label: "조회", onClick: searchA, type: "primary", action: "search" },
        { id: "btn_reset", label: "초기화", onClick: () => setA(DEFAULT_A) },
      ]}
    >
      <div style={{ overflow: "auto", flex: 1, minHeight: 0, display: "flex", flexDirection: "column", gap: 8 }}>
        <section data-testid="sd-area-a">
          <h4 style={{ margin: "4px 0" }}>영역 A — 칸 형식 전부 · autoSearch · 초기화(btn_reset)</h4>
          <SearchArea key={`a-${areaKey}`} autoSearch onSearch={() => log("A", sourceOfAreaSearch(), a)}>
            <SearchField label="품번" name="itemCd" value={a.itemCd} onChange={(v) => setAField("itemCd", v)} />
            <SearchField label="상태" name="status" type="select" options={STATUS_OPTIONS} value={a.status} onChange={(v) => setAField("status", v)} />
            <SearchField label="구분" name="kind" meta={false} type="radio" options={KIND_OPTIONS} value={a.kind} onChange={(v) => setAField("kind", v)} />
            <SearchField label="기준일" name="baseDt" meta={false} type="date" value={a.baseDt} onChange={(v) => setAField("baseDt", v)} />
            <SearchField label="조회 기간" name="fromDt" meta={false} type="date" value={a.fromDt} onChange={(v) => setAField("fromDt", v)} />
            <SearchField label="~" type="date" value={a.toDt} onChange={(v) => setAField("toDt", v)} />
            <SearchField label="작업장" name="workCenter" meta={false} value={a.workCenter} onChange={(v) => setAField("workCenter", v)}>
              <Input data-testid="sd-work-center" value={a.workCenter} onChange={(v) => setAField("workCenter", v)} />
            </SearchField>
            <SearchField
              label="공정"
              name="procCd"
              meta={false}
              type="select"
              options={PROC_OPTIONS}
              value={a.procCd}
              onChange={(v) => setAField("procCd", v)}
            >
              <Select data-testid="sd-proc" value={a.procCd} options={PROC_OPTIONS} onChange={(v) => setAField("procCd", v)} />
            </SearchField>
            <SearchField label="등록 기간" name="regFromDt" meta={false} type="date" value={a.regFromDt} onChange={(v) => setAField("regFromDt", v)}>
              <DatePicker value={a.regFromDt} onChange={(v) => setAField("regFromDt", v)} />
            </SearchField>
            <SearchField label="~" type="date" value={a.regToDt} onChange={(v) => setAField("regToDt", v)}>
              <DatePicker value={a.regToDt} onChange={(v) => setAField("regToDt", v)} />
            </SearchField>
            <SearchField label="메모" defaultKey="memo" value={a.memo} onChange={(v) => setAField("memo", v)} placeholder="defaultKey 칸(마지막 조회값)" />
            <SearchField label="비고" name="remark" meta={false} defaultable={false} value={a.remark} onChange={(v) => setAField("remark", v)} placeholder="defaultable=false" />
            <SearchField label="품목 선택" name="itemSel" meta={false}>
              <span style={{ display: "flex", gap: 4 }}>
                <Input data-testid="sd-item-sel" value={a.itemSel} readOnly placeholder="팝업 결과(대상 아님)" />
                <Button size="sm" onClick={() => setAField("itemSel", "ITEM-9")}>
                  선택
                </Button>
              </span>
            </SearchField>
            <SearchField label="포함 여부">
              <Checkbox checked={a.includeAll} onChange={(v) => setAField("includeAll", v)} label="전체 포함(대상 아님)" />
            </SearchField>
          </SearchArea>
        </section>

        <section data-testid="sd-area-b">
          <h4 style={{ margin: "4px 0" }}>영역 B — defaultsScope=&quot;tab2&quot; (A 와 같은 name)</h4>
          <SearchArea key={`b-${areaKey}`} defaultsScope="tab2" onSearch={() => log("B", "Enter", b)}>
            <SearchField label="품번" name="itemCd" value={b.itemCd} onChange={(v) => setB((p) => ({ ...p, itemCd: v }))} />
            <SearchField label="기준일" name="baseDt" meta={false} type="date" value={b.baseDt} onChange={(v) => setB((p) => ({ ...p, baseDt: v }))} />
          </SearchArea>
        </section>

        <section data-testid="sd-area-c">
          <h4 style={{ margin: "4px 0" }}>영역 C — defaults=false</h4>
          <SearchArea key={`c-${areaKey}`} defaults={false} onSearch={() => log("C", "Enter", c)}>
            <SearchField label="품번" name="itemCd" value={c.itemCd} onChange={(v) => setC({ itemCd: v })} />
          </SearchArea>
        </section>

        <section data-testid="sd-panel" style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(320px, 1fr))", gap: 8 }}>
          <div>
            <h4 style={{ margin: "4px 0" }}>규칙 편집 (사본 출처: {userId ? getSearchDefaultsSource(userId) : "사용자 확인 전"})</h4>
            <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginBottom: 4 }}>
              <Button size="sm" data-testid="sd-load-saved" onClick={() => setRuleText(pretty(pageRules))}>
                저장된 규칙 불러오기
              </Button>
              <Button size="sm" data-testid="sd-fill-sample" onClick={() => setRuleText(pretty(SAMPLE_RULES))}>
                예시 규칙 채우기
              </Button>
              <Button size="sm" onClick={() => setRuleText(pretty(SAMPLE_EDGE_RULES))}>
                예외 규칙 채우기
              </Button>
              <Button size="sm" variant="primary" data-testid="sd-apply-local" onClick={() => applyLocal(parseRuleText())}>
                사본에 넣기
              </Button>
              <Button size="sm" onClick={() => void saveServer()}>
                서버 저장
              </Button>
              <Button size="sm" variant="danger" data-testid="sd-reset-rules" onClick={() => void resetServer()}>
                내 기본값 초기화
              </Button>
              <Button size="sm" data-testid="sd-remount" onClick={remount}>
                영역 다시 열기
              </Button>
            </div>
            <Textarea data-testid="sd-rule-text" value={ruleText} onChange={setRuleText} rows={14} style={{ fontFamily: "monospace", fontSize: 12, width: "100%" }} />
            <div data-testid="sd-rule-message" style={{ fontSize: 12, minHeight: 18 }}>
              {ruleMessage}
            </div>
            <div style={{ display: "flex", gap: 4, alignItems: "center", fontSize: 12 }}>
              기준일 미리보기
              <DatePicker value={previewDate} onChange={setPreviewDate} />
            </div>
            {preview ? (
              <pre data-testid="sd-preview" style={{ fontSize: 12, margin: 0 }}>
                {pretty(preview)}
              </pre>
            ) : null}
          </div>
          <div>
            <h4 style={{ margin: "4px 0" }}>조회 기록 (최근 30건)</h4>
            <div data-testid="sd-log" style={{ fontSize: 12, maxHeight: 360, overflow: "auto" }}>
              {logs.length === 0 ? "기록 없음" : null}
              {logs.map((l, i) => (
                <details key={l.seq} open={i === 0}>
                  <summary>
                    #{l.seq} {l.at} 영역 {l.area} · {l.source}
                  </summary>
                  <pre style={{ margin: 0 }}>{pretty(l.values)}</pre>
                </details>
              ))}
            </div>
          </div>
          <div>
            <h4 style={{ margin: "4px 0" }}>저장된 규칙 · 지금 조건 · 마지막 조회값</h4>
            <pre data-testid="sd-saved" style={{ fontSize: 12, margin: 0 }}>
              {pretty({ 저장된규칙: pageRules })}
            </pre>
            <pre data-testid="sd-current" style={{ fontSize: 12, margin: 0 }}>
              {pretty({ A: a, B: b, C: c })}
            </pre>
            <pre data-testid="sd-last" style={{ fontSize: 12, margin: 0 }}>
              {pretty({ 마지막조회값: lastValues })}
            </pre>
          </div>
        </section>
      </div>
    </PageLayout>
  );
}
