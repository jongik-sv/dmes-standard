/**
 * 유형별 편집 영역 — 실행 유형(코드·BPMN·쿼리·수집·HTTP·보관 삭제)마다 하나씩.
 * 위젯관리의 유형 편집기와 같은 자리에 놓이며, 바뀐 값은 onConfig 로 설정 객체에 합친다.
 */
import type { CSSProperties, ReactNode } from "react";
import { Checkbox, Input, Radio, Select, Textarea } from "@dk-oasis/shared/form";
import { EditableRowList, type GridColumn } from "@dk-oasis/shared/grid";
import { DETAIL_LABEL_CELL, DETAIL_TABLE_STYLE, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import type { CollectItem, CollectSource, JobConfig } from "../../data/job-scheduler-mock";
import type { JobForm } from "./job-form";

const HINT_STYLE: CSSProperties = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" };
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
  onConfig: (patch: Partial<JobConfig>) => void;
  disabled: boolean;
}

function CodeEditor({ form }: KindEditorProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-xs)" }}>
      <Hint>
        코드 작업은 개발자가 Java 로 등록한 작업입니다. 실행 내용은 화면에서 바꿀 수 없고, 일정·사용·시간 초과·변수 값만 바꿉니다.
        새로 만들거나 지울 수 없습니다.
      </Hint>
      {form.codeMissing ? (
        <span className="form-error-message" role="alert">
          코드 없음: 이 앱에서 이 작업의 코드를 찾을 수 없어 실행되지 않습니다. 코드를 다시 배포하거나 [사용/중지]로 멈추세요.
        </span>
      ) : null}
    </div>
  );
}

function BpmnEditor({ form, onConfig, disabled }: KindEditorProps) {
  const c = form.config;
  return (
    <table style={DETAIL_TABLE_STYLE}>
      <tbody>
        <Row label="서비스 ID" required>
          <Input value={c.serviceId} disabled={disabled} placeholder="예: mdmMasterSync" maxLength={80} onChange={(v) => onConfig({ serviceId: v })} />
        </Row>
        <Row label="Action" required>
          <Input value={c.action} disabled={disabled} placeholder="예: sync" maxLength={60} onChange={(v) => onConfig({ action: v })} />
        </Row>
      </tbody>
    </table>
  );
}

function QueryEditor({ form, onConfig, disabled }: KindEditorProps) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-xs)" }}>
      <Textarea
        rows={6}
        value={form.config.sql}
        disabled={disabled}
        placeholder={"UPDATE TB_XXX\n   SET STATUS = 'C'\n WHERE BASE_DT = :yesterday"}
        aria-label="실행할 SQL"
        onChange={(v) => onConfig({ sql: v })}
      />
      <Hint>
        모듈 DB 에 실행할 INSERT·UPDATE·DELETE·MERGE 한 문장이나 프로시저 호출(BEGIN PKG.PROC(:schedAt); END;)을 씁니다. SELECT 는 쓸 수 없고,
        영향받은 행 수를 실행 기록의 건수에 남깁니다.
      </Hint>
    </div>
  );
}

const ITEM_COLUMNS: GridColumn[] = [
  { key: "key", header: "키", width: 3, minWidth: 90, align: "left", editable: true },
  { key: "path", header: "경로", width: 5, minWidth: 130, align: "left", editable: true },
];

const SOURCE_OPTIONS: { value: CollectSource; label: string }[] = [
  { value: "SQL", label: "SQL" },
  { value: "HTTP", label: "HTTP JSON" },
  { value: "EXCHANGE", label: "환율" },
];

const CURRENCY_CHOICES = ["USD", "JPY", "EUR", "CNY", "GBP"];

function CollectEditor({ form, onConfig, disabled }: KindEditorProps) {
  const c = form.config;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-sm)" }}>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <Row label="원천" required>
            <Radio
              name="collectSource"
              options={SOURCE_OPTIONS}
              value={c.collectSource}
              disabled={disabled}
              onChange={(v) => onConfig({ collectSource: v as CollectSource })}
            />
          </Row>
          {c.collectSource === "SQL" && (
            <>
              <Row label="SQL" required>
                <Textarea
                  rows={6}
                  value={c.sql}
                  disabled={disabled}
                  placeholder={"SELECT LINE_CD AS ITEM_KEY\n     , RUN_RATE AS ITEM_VALUE\n  FROM TB_XXX"}
                  aria-label="원천 SQL"
                  onChange={(v) => onConfig({ sql: v })}
                />
              </Row>
              <Row label="값 칸" required>
                <Input value={c.valueField} disabled={disabled} placeholder="예: ITEM_VALUE" onChange={(v) => onConfig({ valueField: v })} />
              </Row>
              <Row label="키 칸" required>
                <Input value={c.keyField} disabled={disabled} placeholder="예: ITEM_KEY" onChange={(v) => onConfig({ keyField: v })} />
              </Row>
            </>
          )}
          {c.collectSource === "HTTP" && (
            <Row label="URL" required>
              <Input
                value={c.collectUrl}
                disabled={disabled}
                placeholder="허용 호스트 주소 예: iot.dongkuk.example/v1/plant/temperature"
                onChange={(v) => onConfig({ collectUrl: v })}
              />
            </Row>
          )}
          {c.collectSource === "EXCHANGE" && (
            <Row label="통화 목록" required>
              <div style={{ display: "flex", flexWrap: "wrap", gap: "var(--spacing-md)" }}>
                {CURRENCY_CHOICES.map((cur) => (
                  <Checkbox
                    key={cur}
                    label={cur}
                    checked={c.currencies.includes(cur)}
                    disabled={disabled}
                    onChange={(on) =>
                      onConfig({
                        currencies: on
                          ? CURRENCY_CHOICES.filter((x) => x === cur || c.currencies.includes(x))
                          : c.currencies.filter((x) => x !== cur),
                      })
                    }
                  />
                ))}
              </div>
            </Row>
          )}
        </tbody>
      </table>
      {c.collectSource === "HTTP" && (
        <EditableRowList<CollectItem>
          title="수집 항목"
          items={c.items}
          columns={ITEM_COLUMNS}
          onChange={(items) => onConfig({ items })}
          newItem={() => ({ key: "", path: "" })}
          addLabel="행 추가"
          emptyMessage="수집 항목이 없습니다. [행 추가]로 더합니다."
          normalize={(_f, v) => String(v ?? "").trim()}
          height={190}
          idPrefix="job-collect-item"
        />
      )}
      <Hint>
        모은 항목 값은 수집 값 표에 저장되고 위젯이 이 값을 보여 줍니다.{" "}
        {c.collectSource === "SQL" && "원천 SQL 은 SELECT 만 쓰며 읽기 전용으로 실행합니다."}
        {c.collectSource === "HTTP" && "응답 JSON 에서 경로(예: $.plants[0].temp)로 값을 꺼냅니다. 허용 호스트만 호출할 수 있습니다."}
        {c.collectSource === "EXCHANGE" && "환율 수집은 실행 간격이 60분 이상이어야 합니다."}
      </Hint>
    </div>
  );
}

const METHOD_OPTIONS = [
  { value: "GET", label: "GET" },
  { value: "POST", label: "POST" },
];

const SUCCESS_OPTIONS = [
  { value: "2XX", label: "2xx 응답이면 성공" },
  { value: "200", label: "200 응답만 성공" },
];

function HttpEditor({ form, onConfig, disabled }: KindEditorProps) {
  const c = form.config;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-xs)" }}>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <Row label="메서드" required>
            <Radio
              name="httpMethod"
              options={METHOD_OPTIONS}
              value={c.method}
              disabled={disabled}
              onChange={(v) => onConfig({ method: v === "GET" ? "GET" : "POST" })}
            />
          </Row>
          <Row label="URL" required>
            <Input
              value={c.url}
              disabled={disabled}
              placeholder="허용 호스트 주소 예: erp.dongkuk.example/mes/shipments/push"
              onChange={(v) => onConfig({ url: v })}
            />
          </Row>
          <Row label="본문(JSON)">
            <Textarea
              rows={4}
              value={c.body}
              disabled={disabled || c.method === "GET"}
              placeholder={c.method === "GET" ? "GET 은 본문을 보내지 않습니다." : '{\n  "since": ":prevRunAt"\n}'}
              aria-label="본문(JSON)"
              onChange={(v) => onConfig({ body: v })}
            />
          </Row>
          <Row label="성공 판정">
            <Select
              value={c.successRule}
              options={SUCCESS_OPTIONS}
              disabled={disabled}
              onChange={(v) => onConfig({ successRule: v === "200" ? "200" : "2XX" })}
            />
          </Row>
        </tbody>
      </table>
      <Hint>외부 시스템 트리거나 웹훅에 씁니다. 허용 호스트만 호출할 수 있고, 리다이렉트는 따라가지 않습니다.</Hint>
    </div>
  );
}

function PurgeEditor({ form, onConfig, disabled }: KindEditorProps) {
  const c = form.config;
  const summary =
    c.table && c.dateColumn
      ? `${c.table} 에서 ${c.dateColumn} 가 ${c.retainDays || "?"}일 지난 행을 한 번에 ${c.batchSize || "?"}행씩 지웁니다.`
      : "대상 표와 날짜 칸을 입력하면 지우는 내용이 여기에 요약됩니다.";
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: "var(--spacing-xs)" }}>
      <table style={DETAIL_TABLE_STYLE}>
        <tbody>
          <Row label="대상 표" required>
            <Input value={c.table} disabled={disabled} placeholder="예: TB_MQC_INSPECT_LOG" onChange={(v) => onConfig({ table: v })} />
          </Row>
          <Row label="날짜 칸" required>
            <Input value={c.dateColumn} disabled={disabled} placeholder="예: C_AT" onChange={(v) => onConfig({ dateColumn: v })} />
          </Row>
          <Row label="보관 일수" required>
            <Input type="number" min={1} value={c.retainDays} disabled={disabled} onChange={(v) => onConfig({ retainDays: v })} />
          </Row>
          <Row label="한 번에 지울 행 수" required>
            <Input type="number" min={1} value={c.batchSize} disabled={disabled} onChange={(v) => onConfig({ batchSize: v })} />
          </Row>
        </tbody>
      </table>
      <Hint>{summary}</Hint>
    </div>
  );
}

export function KindEditor(props: KindEditorProps) {
  switch (props.form.kind) {
    case "CODE":
      return <CodeEditor {...props} />;
    case "BPMN":
      return <BpmnEditor {...props} />;
    case "QUERY":
      return <QueryEditor {...props} />;
    case "COLLECT":
      return <CollectEditor {...props} />;
    case "HTTP":
      return <HttpEditor {...props} />;
    case "PURGE":
      return <PurgeEditor {...props} />;
    default:
      return null;
  }
}
