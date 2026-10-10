"use client";

/**
 * 유형별 입력 영역 — CODE(처리기 고르기)·BPMN(서비스 ID·Action)·QUERY(SQL)·COLLECT(원천·저장 여부).
 * 바뀐 값은 onChange 로 폼에 합친다. 유형은 저장 뒤에 바꿀 수 없다.
 */
import { useMemo, type ReactNode } from "react";

import { SqlCodeEditor } from "@dk-oasis/shared/code-editor";
import { Checkbox, Input, Radio, Select } from "@dk-oasis/shared/form";
import { EditableRowList, type GridColumn } from "@dk-oasis/shared/grid";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";

import type { CollectItemRow, CollectSourceKind, JobForm } from "./form-model";
import type { HandlerRow } from "./types";

const HINT_STYLE = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" } as const;
const REQUIRED_MARK = <span style={{ color: "var(--color-danger)" }}> *</span>;

function Row({ label, required, children }: { label: string; required?: boolean; children: ReactNode }) {
  return (
    <tr>
      <th style={DETAIL_LABEL_CELL}>
        {label}
        {required ? REQUIRED_MARK : null}
      </th>
      <td style={DETAIL_VALUE_CELL}>{children}</td>
    </tr>
  );
}

function Hint({ children }: { children: ReactNode }) {
  return <div style={HINT_STYLE}>{children}</div>;
}

export interface KindEditorProps {
  form: JobForm;
  /** CODE 유형의 처리기 선택지(전체 모듈). */
  handlers: readonly HandlerRow[];
  disabled: boolean;
  onChange: (patch: Partial<JobForm>) => void;
  /** 처리기를 고를 때 — 이름·일정·변수 기본값을 함께 채워야 해서 patch 가 아니라 별도 통로로 알린다. */
  onPickHandler: (handler: HandlerRow | null) => void;
}

function CodeEditor({ form, handlers, disabled, onPickHandler }: KindEditorProps) {
  const options = useMemo(() => {
    const own = handlers.filter((h) => h.moduleCd === form.moduleCd);
    return [
      { value: "", label: own.length === 0 ? "(등록된 처리기 없음)" : "(처리기를 고르세요)" },
      ...own.map((h) => ({ value: h.handlerId, label: `${h.handlerNm} · ${h.handlerId}${h.missing ? " (코드 없음)" : ""}` })),
    ];
  }, [handlers, form.moduleCd]);
  const locked = disabled || !form.isNew;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-xs)" }}>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <Row label="처리기" required>
            <Select
              value={form.handlerId}
              options={options}
              disabled={locked}
              aria-label="처리기"
              data-testid="job-handler"
              onChange={(v) => onPickHandler(handlers.find((h) => h.moduleCd === form.moduleCd && h.handlerId === v) ?? null)}
            />
          </Row>
        </tbody>
      </table>
      <Hint>
        코드에 등록된 처리기만 고를 수 있습니다. 목록은 각 모듈 앱이 기동할 때 등록합니다. 실행 내용은 화면에서 바꿀 수 없고 일정·사용·시간 초과·변수 값만
        바꿉니다.
      </Hint>
      {form.codeMissing ? (
        <span className="form-error-message" role="alert">
          코드 없음: 이 처리기가 최근 7일 동안 기동한 앱에서 확인되지 않아 실행되지 않습니다. 코드를 다시 배포하거나 [사용/중지]로 멈추세요.
        </span>
      ) : null}
    </div>
  );
}

function BpmnEditor({ form, disabled, onChange }: KindEditorProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-xs)" }}>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <Row label="서비스 ID" required>
            <Input value={form.serviceId} disabled={disabled} placeholder="예: dma^^termMng" maxLength={200} onChange={(v) => onChange({ serviceId: v })} />
          </Row>
          <Row label="Action" required>
            <Input value={form.svcAction} disabled={disabled} placeholder="예: rebuild" maxLength={50} onChange={(v) => onChange({ svcAction: v })} />
          </Row>
        </tbody>
      </table>
      <Hint>없는 서비스 ID 는 저장은 되지만 실행할 때 실패로 남습니다. 예약 작업 내장 서비스(jobDispatch·jobCode·jobQuery·jobCollect)는 쓸 수 없습니다.</Hint>
    </div>
  );
}

function QueryEditor({ form, disabled, onChange }: KindEditorProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-xs)" }}>
      <SqlCodeEditor
        value={form.sql}
        readOnly={disabled}
        height={150}
        placeholder={"UPDATE TB_XXX\n   SET STATUS = 'C'\n WHERE BASE_DT = :baseDt"}
        ariaLabel="실행할 SQL"
        expandTitle="실행할 SQL"
        testId="job-query-sql"
        onChange={(v) => onChange({ sql: v })}
      />
      <Hint>
        그 모듈 DB 에 실행할 INSERT·UPDATE·DELETE·MERGE 한 문장이나 프로시저 호출(BEGIN PKG.PROC(:schedAt); END;)을 씁니다. SELECT·DDL·COMMIT 은
        쓸 수 없고, 영향받은 행 수를 실행 기록의 건수에 남깁니다. :이름 은 아래 변수 표에 선언해야 합니다.
      </Hint>
    </div>
  );
}

const ITEM_COLUMNS: GridColumn[] = [
  { key: "key", header: "키", width: 3, minWidth: 90, align: "left", editable: true, meta: false },
  { key: "path", header: "경로", width: 5, minWidth: 130, align: "left", editable: true, meta: false },
];

const SOURCE_OPTIONS = [
  { value: "sql", label: "SQL" },
  { value: "http", label: "HTTP JSON" },
];
const normalizeItem = (_field: string, value: unknown) => String(value ?? "").trim();
const newItem = (): CollectItemRow => ({ key: "", path: "" });

function CollectEditor({ form, disabled, onChange }: KindEditorProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-sm)" }}>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <Row label="원천" required>
            <Radio
              name="jobCollectSource"
              options={SOURCE_OPTIONS}
              value={form.collectKind}
              disabled={disabled}
              onChange={(v) => onChange({ collectKind: v as CollectSourceKind })}
            />
          </Row>
          {form.collectKind === "sql" && (
            <>
              <Row label="SQL" required>
                <SqlCodeEditor
                  value={form.collectSql}
                  readOnly={disabled}
                  height={150}
                  placeholder={"SELECT LINE_CD AS ITEM_KEY\n     , RUN_RATE AS ITEM_VALUE\n  FROM TB_XXX"}
                  ariaLabel="원천 SQL"
                  expandTitle="원천 SQL"
                  testId="job-collect-sql"
                  onChange={(v) => onChange({ collectSql: v })}
                />
              </Row>
              <Row label="값 칸" required>
                <Input value={form.valueField} disabled={disabled} placeholder="예: ITEM_VALUE" maxLength={60} onChange={(v) => onChange({ valueField: v })} />
              </Row>
              <Row label="키 칸">
                <Input value={form.keyField} disabled={disabled} placeholder="예: ITEM_KEY (비우면 값 하나만 저장)" maxLength={60} onChange={(v) => onChange({ keyField: v })} />
              </Row>
            </>
          )}
          {form.collectKind === "http" && (
            <Row label="URL" required>
              <Input
                value={form.collectUrl}
                disabled={disabled}
                placeholder="허용 호스트 주소 예: https://iot.example.com/v1/temperature"
                maxLength={500}
                onChange={(v) => onChange({ collectUrl: v })}
              />
            </Row>
          )}
          {form.collectKind === "http" && (
            <Row label="재시도">
              <Checkbox
                label="일시 오류일 때 몇 초 뒤 한 번 다시 시도"
                checked={form.retryTransient}
                disabled={disabled}
                data-testid="job-collect-retry-transient"
                onChange={(on) => onChange({ retryTransient: on })}
              />
            </Row>
          )}
          {form.collectKind === "unsupported" && (
            <Row label="안내">
              <span className="form-error-message" role="alert">
                지원하지 않는 수집 원천입니다. 환율 수집은 MDM 환율 마스터(예약 작업 mdm.exchangeRateSync)로 일원화되어 제거되었습니다. 위에서 SQL 또는 HTTP JSON 을 골라
                다시 설정해야 저장할 수 있습니다.
              </span>
            </Row>
          )}
          <Row label="저장">
            <Checkbox
              label="읽은 값을 수집 값 표에 저장"
              checked={form.save}
              disabled={disabled}
              data-testid="job-collect-save"
              onChange={(on) => onChange({ save: on })}
            />
          </Row>
        </tbody>
      </table>
      {form.collectKind === "http" && (
        <EditableRowList<CollectItemRow>
          title="수집 항목"
          items={form.items}
          columns={ITEM_COLUMNS}
          onChange={(items) => onChange({ items })}
          newItem={newItem}
          addLabel="행 추가"
          emptyMessage="수집 항목이 없습니다. [행 추가]로 더합니다."
          normalize={normalizeItem}
          height={190}
          idPrefix="job-collect-item"
        />
      )}
      <Hint>
        {form.save
          ? "모은 항목 값은 수집 값 표(TB_MCM_JOB_COLLECT_DATA)에 저장합니다. 쿼리 위젯 등에서 SQL 로 읽을 수 있습니다."
          : "저장하지 않고 읽기만 합니다(외부 시스템을 깨우는 트리거용). 실행 기록에는 읽은 항목 수가 남습니다."}{" "}
        {form.collectKind === "sql" && "원천 SQL 은 SELECT 만 쓰며 읽기 전용으로 실행합니다."}
        {form.collectKind === "http" &&
          "응답 JSON 에서 경로(예: data.items[0].price)로 값을 꺼냅니다. 허용 호스트만 호출할 수 있고 GET 만 씁니다. 「일시 오류 재시도」는 한 번 실행 안에서 503·502·504·429·연결 시간 초과일 때 3초쯤 뒤 한 번만 다시 부르며, 아래 「실패 시 재시도」(실패한 실행을 분 단위로 다시 실행)와 별개입니다."}
        {" 실행 간격은 5분 이상이어야 합니다."}
      </Hint>
    </div>
  );
}

export function KindEditor(props: KindEditorProps) {
  switch (props.form.jobKind) {
    case "CODE":
      return <CodeEditor {...props} />;
    case "BPMN":
      return <BpmnEditor {...props} />;
    case "QUERY":
      return <QueryEditor {...props} />;
    case "COLLECT":
      return <CollectEditor {...props} />;
    default:
      return null;
  }
}
