"use client";

/**
 * 정시 수집 편집기(docs/widget-2026-10/spec-widget-data.md §2·§6) — 일정(주기 또는 시각 목록)·원천(SQL·HTTP JSON·환율)과 종류별 칸·표시(기간·단위).
 * SQL 칸은 쿼리 위젯의 SqlEditor 를 재사용한다(조회 조건 params 는 쓰지 않는다). HTTP·환율은 시험 버튼 없이 안내 문구만 둔다.
 * 검사(collectErrors)가 칸 단위로 오류를 보이고, 합친 목록을 onValidate 로 알려 저장을 막는다.
 */
import { useCallback, useEffect, useMemo, useRef, type ReactNode } from "react";
import { Checkbox, Input, Select, SelectOrInput } from "@dk-oasis/shared/form";
import { EditableRowList, type GridColumn } from "@dk-oasis/shared/grid";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import { MdmFieldLabel, MdmMetaProvider } from "@dk-oasis/shared/mdm-meta";
import type { WidgetTypeEditorProps } from "@dk-oasis/shared/widget";

import { EXCHANGE_CURRENCIES, toggleCurrency } from "@/widget-types/_ext/config";
import { useReportErrors } from "@/widget-types/_ext/use-report-errors";
import { FIELD_INPUT_PLACEHOLDER, QueryStyle } from "../_query/parts";
import { patchConfig, previewOf, textCell } from "../_query/format";
import { SqlEditor } from "../_query/SqlEditor";
import {
  collectErrors,
  CURRENCIES_MAX,
  DAILY_AT_MAX,
  EVERY_MIN_OPTIONS,
  EXCHANGE_EVERY_MIN_FLOOR,
  everyMinLabel,
  HTTP_ITEMS_MAX,
  readCollectConfig,
  SCHEDULE_MODE_LABELS,
  scheduleToJson,
  SHOW_DAYS_MAX,
  SHOW_DAYS_MIN,
  showToJson,
  SOURCE_KIND_LABELS,
  sourceOfKind,
  sourceToJson,
  UNIT_MAX,
  type CollectSchedule,
  type CollectShow,
  type CollectSource,
  type HttpItem,
  type SourceKind,
} from "./config";
import { COLLECT_CSS, COLLECT_STYLE_HREF } from "./styles";

const MODE_OPTIONS = Object.entries(SCHEDULE_MODE_LABELS).map(([value, label]) => ({ value, label }));
const KIND_OPTIONS = Object.entries(SOURCE_KIND_LABELS).map(([value, label]) => ({ value, label }));

const AT_COLUMNS: GridColumn[] = [{ key: "at", header: "수집 시각(HH:mm) *", width: 140, editable: true, meta: false }];
const ITEM_COLUMNS: GridColumn[] = [
  { key: "key", header: "항목 이름 *", width: 140, editable: true, meta: false },
  { key: "path", header: "값 위치 *(예: data.items[0].price)", width: 260, editable: true, meta: false },
];

/** 칸 값 정리 — 공백만 지운다(빈 칸은 검사가 잡는다). */
const trimmed = (_field: string, value: unknown): unknown => textCell(value) ?? "";

/** 칸 아래 오류 문구 — 읽어 주기는 편집기 맨 아래의 aria-live 한 곳이 맡는다(문구마다 alert 로 읽히지 않게). */
function Errors({ list, id }: { list: readonly string[]; id: string }) {
  return (
    <>
      {list.map((m, i) => (
        <span key={`${i}-${m}`} className="form-error-message" data-testid={`wc-err-${id}`}>
          {m}
        </span>
      ))}
    </>
  );
}

function Row({ name, label, required, children }: { name: string; label: string; required?: boolean; children: ReactNode }) {
  return (
    <tr>
      <th style={DETAIL_LABEL_CELL}>
        <MdmFieldLabel name={name} label={label} required={required} />
      </th>
      <td style={DETAIL_VALUE_CELL}>{children}</td>
    </tr>
  );
}

/** 입력 칸에 보일 원래 글자 — 숫자로 읽기 전의 값(지운 칸은 빈 글자). */
function rawShowDays(value: unknown): string {
  const show = typeof value === "object" && value !== null ? (value as Record<string, unknown>).show : undefined;
  const days = typeof show === "object" && show !== null ? (show as Record<string, unknown>).days : undefined;
  return days === undefined || days === null ? "" : String(days);
}

export default function CollectEditor({ value, onChange, onValidate }: WidgetTypeEditorProps) {
  const cfg = useMemo(() => readCollectConfig(value), [value]);
  const errors = useMemo(() => collectErrors(value), [value]);
  const allErrors = [...errors.schedule, ...errors.source, ...errors.show];
  useReportErrors(allErrors, onValidate);
  const preview = useMemo(() => previewOf(value), [value]);
  const columns = preview?.columns ?? [];

  // [쿼리 시험] 은 비동기라 끝난 뒤에도 최신 값 위에 얹는다.
  const latest = useRef<unknown>(value);
  useEffect(() => {
    latest.current = value;
  }, [value]);
  const patch = useCallback(
    (p: Record<string, unknown>) => {
      const next = patchConfig(latest.current, p);
      latest.current = next;
      onChange(next);
    },
    [onChange]
  );
  const current = () => readCollectConfig(latest.current);

  const setSchedule = (p: Partial<CollectSchedule>) => patch({ schedule: scheduleToJson({ ...current().schedule, ...p }) });
  const setSource = (p: Partial<CollectSource>) => patch({ source: sourceToJson({ ...current().source, ...p }) });
  const setShow = (p: Partial<CollectShow>) => patch({ show: showToJson({ ...current().show, ...p }) });

  // 환율 원천은 60분 미만 주기를 고를 수 없다(서버 저장 규칙) — 선택지에서 뺀다. 옛 설정의 현재 값은 남겨 오류와 함께 보인다.
  const exchange = cfg.source.kind === "exchange";
  const everyOptions = useMemo(() => {
    const allowed = EVERY_MIN_OPTIONS.filter((n) => !exchange || n >= EXCHANGE_EVERY_MIN_FLOOR);
    const list = allowed.includes(cfg.schedule.everyMin) ? [...allowed] : [cfg.schedule.everyMin, ...allowed];
    return list.map((n) => ({ value: String(n), label: everyMinLabel(n) }));
  }, [cfg.schedule.everyMin, exchange]);

  const currencyOptions = useMemo(() => {
    const known = EXCHANGE_CURRENCIES as readonly string[];
    return [...known, ...cfg.source.currencies.filter((c) => !known.includes(c))];
  }, [cfg.source.currencies]);
  const fullCurrencies = cfg.source.currencies.length >= CURRENCIES_MAX;

  const changeMode = (mode: string) => {
    if (mode === "daily") setSchedule({ mode: "daily", at: current().schedule.at.length > 0 ? current().schedule.at : ["09:00"] });
    else setSchedule({ mode: "interval" });
  };

  const changeKind = (kind: string) => {
    const prev = current().source;
    const next = sourceOfKind(kind as SourceKind, prev);
    const sched = current().schedule;
    // 환율로 바꾸면서 주기가 60분 미만이면 하한(60분)으로 올린다.
    const schedule =
      next.kind === "exchange" && sched.mode === "interval" && sched.everyMin < EXCHANGE_EVERY_MIN_FLOOR
        ? { schedule: scheduleToJson({ ...sched, everyMin: EXCHANGE_EVERY_MIN_FLOOR }) }
        : {};
    patch({ source: sourceToJson(next), ...schedule, ...(next.kind === "sql" ? {} : { __preview: undefined }) });
  };

  return (
    <MdmMetaProvider disabled>
      <QueryStyle />
      <style href={COLLECT_STYLE_HREF} precedence="default">
        {COLLECT_CSS}
      </style>
      <table style={DETAIL_TABLE_STYLE} data-testid="widget-editor-collect">
        <tbody>
          <Row name="schedule" label="일정" required>
            <div className="wc-edit">
              <div className="wc-edit__row">
                <div className="wc-edit__field">
                  <Select value={cfg.schedule.mode} options={MODE_OPTIONS} onChange={changeMode} aria-label="수집 방식" data-testid="wc-mode" />
                </div>
                {cfg.schedule.mode === "interval" && (
                  <>
                    <div className="wc-edit__field">
                      <Select
                        value={String(cfg.schedule.everyMin)}
                        options={everyOptions}
                        onChange={(v) => setSchedule({ everyMin: Number(v) })}
                        aria-label="수집 주기"
                        data-testid="wc-every"
                      />
                    </div>
                    <span className="wq-hint">
                      자정부터 이 간격으로 모읍니다(예: 10분 → 0:00, 0:10, 0:20 …).
                      {exchange && ` 환율 원천은 외부 호출이 잦지 않게 ${EXCHANGE_EVERY_MIN_FLOOR}분 이상만 고를 수 있습니다.`}
                    </span>
                  </>
                )}
              </div>
              {cfg.schedule.mode === "daily" && (
                <EditableRowList<{ at: string }>
                  idPrefix="wc-at"
                  title="수집 시각"
                  items={cfg.schedule.at.map((at) => ({ at }))}
                  columns={AT_COLUMNS}
                  onChange={(rows) => setSchedule({ at: rows.map((r) => r.at) })}
                  newItem={() => ({ at: "" })}
                  addLabel="시각 추가"
                  emptyMessage="수집 시각을 넣으세요"
                  normalize={trimmed}
                  height={160}
                  testId="wc-at-list"
                />
              )}
              <span className="wq-hint">
                한국 시간(Asia/Seoul) 기준입니다. 서버가 꺼져 있던 동안 지난 시각은 따라잡지 않고 건너뜁니다.
                {cfg.schedule.mode === "daily" && ` 시각은 최대 ${DAILY_AT_MAX}개, HH:mm(24시간제)로 적습니다.`}
              </span>
              <Errors list={errors.schedule} id="schedule" />
            </div>
          </Row>
          <Row name="source" label="원천" required>
            <div className="wc-edit">
              <div className="wc-edit__row">
                <div className="wc-edit__field">
                  <Select value={cfg.source.kind} options={KIND_OPTIONS} onChange={changeKind} aria-label="원천 종류" data-testid="wc-kind" />
                </div>
              </div>
              {cfg.source.kind === "sql" && (
                <>
                  <SqlEditor
                    sql={cfg.source.sql}
                    variant="collect"
                    preview={preview}
                    onSqlChange={(sql) => setSource({ sql })}
                    onPreview={(result) => patch({ __preview: result ?? undefined })}
                  />
                  <div className="wc-edit__row">
                    <label>값 컬럼 *</label>
                    <div className="wc-edit__field">
                      <SelectOrInput
                        value={cfg.source.valueField}
                        options={columns}
                        inputPlaceholder={FIELD_INPUT_PLACEHOLDER}
                        onChange={(valueField) => setSource({ valueField })}
                        ariaLabel="값 컬럼"
                      />
                    </div>
                    <label>항목 컬럼</label>
                    <div className="wc-edit__field">
                      <SelectOrInput
                        value={cfg.source.keyField}
                        options={columns}
                        inputPlaceholder={FIELD_INPUT_PLACEHOLDER}
                        optional
                        onChange={(keyField) => setSource({ keyField })}
                        ariaLabel="항목 컬럼"
                      />
                    </div>
                  </div>
                  <span className="wq-hint">
                    항목 컬럼을 고르면 결과 행마다 항목 하나(이름=그 컬럼 값, 한 회차 최대 50개)를 모읍니다. 비우면 첫 행의 값 컬럼 하나를 「VALUE」 항목으로 모읍니다.
                  </span>
                </>
              )}
              {cfg.source.kind === "http" && (
                <>
                  <div className="wc-edit__row">
                    <label htmlFor="wc-url">주소 *</label>
                    <div className="wc-edit__wide">
                      <Input
                        id="wc-url"
                        value={cfg.source.url}
                        onChange={(url) => setSource({ url })}
                        placeholder="https://example.com/api/price"
                        aria-label="주소"
                        data-testid="wc-url"
                      />
                    </div>
                  </div>
                  <EditableRowList<HttpItem>
                    idPrefix="wc-item"
                    title="수집 항목"
                    items={cfg.source.items}
                    columns={ITEM_COLUMNS}
                    onChange={(items) => setSource({ items })}
                    newItem={() => ({ key: "", path: "" })}
                    addLabel="항목 추가"
                    emptyMessage="수집 항목을 넣으세요"
                    normalize={trimmed}
                    height={200}
                    testId="wc-items"
                  />
                  <span className="wq-hint">
                    http·https 주소만 쓸 수 있고 사용자 정보(user:pw@)는 넣을 수 없습니다. 서버에 등록된 허용 호스트의 주소만 수집하며(허용 목록이 비어 있으면 HTTP 원천은 모두 거절됩니다),
                    리다이렉트는 따라가지 않습니다. 응답은 JSON 이어야 하고 항목은 최대 {HTTP_ITEMS_MAX}개입니다. 값이 숫자면 숫자로, 그 밖은 글자(200자까지)로 모읍니다.
                    이 원천은 시험 버튼이 없습니다 — 저장한 뒤 다음 수집 시각에 값이 쌓입니다.
                  </span>
                </>
              )}
              {cfg.source.kind === "exchange" && (
                <>
                  <div className="wc-edit__checks" role="group" aria-label="통화 선택" data-testid="wc-currencies">
                    {currencyOptions.map((cur) => {
                      const checked = cfg.source.currencies.includes(cur);
                      return (
                        <Checkbox
                          key={cur}
                          label={cur}
                          checked={checked}
                          disabled={!checked && fullCurrencies}
                          onChange={(on) => setSource({ currencies: toggleCurrency(current().source.currencies, cur, on) })}
                        />
                      );
                    })}
                  </div>
                  <span className="wq-hint">
                    원화(KRW) 기준 각 통화의 오늘 값을 모읍니다(최대 {CURRENCIES_MAX}개, 선택 {cfg.source.currencies.length}개). 값이 아직 없는 통화는 건너뛰고, 서버의 외부 연동 설정이 꺼져 있으면 수집하지 않고
                    실패로 기록합니다. 이 원천은 시험 버튼이 없습니다 — 저장한 뒤 다음 수집 시각에 값이 쌓입니다.
                  </span>
                </>
              )}
              <Errors list={errors.source} id="source" />
            </div>
          </Row>
          <Row name="show" label="표시">
            <div className="wc-edit">
              <div className="wc-edit__row">
                <label htmlFor="wc-days">기간(일)</label>
                <div className="wc-edit__field">
                  <Input
                    id="wc-days"
                    type="number"
                    value={rawShowDays(value)}
                    onChange={(v) => {
                      const raw = v.trim();
                      const days = raw === "" ? undefined : Number(raw);
                      patch({ show: { ...showToJson(current().show), days } });
                    }}
                    placeholder={`${SHOW_DAYS_MIN}~${SHOW_DAYS_MAX}`}
                    aria-label="표시 기간"
                    data-testid="wc-days"
                  />
                </div>
                <label htmlFor="wc-unit">단위</label>
                <div className="wc-edit__field">
                  <Input
                    id="wc-unit"
                    value={cfg.show.unit}
                    onChange={(unit) => setShow({ unit })}
                    onBlur={() => {
                      // 칸을 벗어나면 앞뒤 공백을 지워 저장한다(서버는 받은 값 길이로 검사한다).
                      const u = current().show.unit;
                      if (u !== u.trim()) setShow({ unit: u.trim() });
                    }}
                    placeholder="예: 건, 원, %"
                    aria-label="값 단위"
                    data-testid="wc-unit"
                  />
                </div>
              </div>
              <span className="wq-hint">
                위젯이 읽을 기간입니다({SHOW_DAYS_MIN}~{SHOW_DAYS_MAX}일, 비우면 7일, 최대 500건). 단위는 숫자 값 뒤에 붙으며 {UNIT_MAX}자까지입니다. 수집한 값은 90일 동안 보관합니다.
              </span>
              <Errors list={errors.show} id="show" />
            </div>
          </Row>
        </tbody>
      </table>
      <div className="wc-sr" aria-live="polite" data-testid="wc-live">
        {allErrors.join(". ")}
      </div>
    </MdmMetaProvider>
  );
}
