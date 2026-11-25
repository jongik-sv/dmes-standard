/**
 * 인쇄 용지(PrintPreviewModal) 안을 채우는 조각 — 머리, 라벨·값 칸, 구역 제목, 표, 서명란.
 * 인쇄 문서의 표는 데이터 그리드가 아니라 종이 양식이므로(가상 스크롤·절대 배치 없이 전부 찍혀야 한다) 일반 표 요소로 그린다.
 * 색은 의미 토큰만 쓴다. shared 등록 후보(PrintPreviewModal 과 함께).
 */
import type { CSSProperties, ReactNode } from "react";

const CELL: CSSProperties = { border: "1px solid var(--color-border-strong)", padding: "4px 8px", verticalAlign: "middle" };
const HEAD_CELL: CSSProperties = { ...CELL, background: "var(--color-bg-header)", fontWeight: 600, textAlign: "center", whiteSpace: "nowrap" };
const TABLE: CSSProperties = { width: "100%", borderCollapse: "collapse", fontSize: "var(--font-size-sm)" };

export function SheetHeader({ title, subtitle, docNo, issuer }: { title: string; subtitle?: string; docNo?: string; issuer?: string }) {
  return (
    <div style={{ borderBottom: "2px solid var(--color-text)", paddingBottom: 8, marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 12 }}>
        <div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: 2 }}>{title}</div>
          {subtitle ? <div style={{ color: "var(--color-text-secondary)" }}>{subtitle}</div> : null}
        </div>
        <div style={{ textAlign: "right" }}>
          {issuer ? <div style={{ fontWeight: 600 }}>{issuer}</div> : null}
          {docNo ? <div style={{ fontFamily: "monospace" }}>{docNo}</div> : null}
        </div>
      </div>
    </div>
  );
}

/** 라벨·값 칸 묶음(한 줄에 columns 쌍). */
export function SheetFields({ fields, columns = 2 }: { fields: [label: string, value: ReactNode][]; columns?: number }) {
  const rows: [string, ReactNode][][] = [];
  for (let i = 0; i < fields.length; i += columns) rows.push(fields.slice(i, i + columns));
  return (
    <table style={{ ...TABLE, marginBottom: 14 }}>
      <tbody>
        {rows.map((r, i) => (
          <tr key={i}>
            {r.map(([label, value]) => [
              <th key={`${label}-l`} style={{ ...HEAD_CELL, width: `${Math.round(40 / columns)}%`, textAlign: "left" }}>
                {label}
              </th>,
              <td key={`${label}-v`} style={CELL}>
                {value ?? "—"}
              </td>,
            ])}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

export function SheetSection({ title, children }: { title: string; children: ReactNode }) {
  return (
    <div style={{ marginBottom: 14 }}>
      <div style={{ fontWeight: 700, margin: "6px 0 4px" }}>■ {title}</div>
      {children}
    </div>
  );
}

export interface SheetColumn {
  key: string;
  header: string;
  align?: "left" | "center" | "right";
  width?: number | string;
}

/** 머리 줄 + 데이터 줄 표. 머리 줄도 tbody 의 첫 줄이다(종이 양식). */
export function SheetTable({ columns, rows, emptyText = "—" }: { columns: SheetColumn[]; rows: Record<string, unknown>[]; emptyText?: string }) {
  return (
    <table style={TABLE}>
      <tbody>
        <tr>
          {columns.map((c) => (
            <th key={c.key} style={{ ...HEAD_CELL, width: c.width }}>
              {c.header}
            </th>
          ))}
        </tr>
        {rows.length === 0 ? (
          <tr>
            <td style={{ ...CELL, textAlign: "center" }} colSpan={columns.length}>
              {emptyText}
            </td>
          </tr>
        ) : (
          rows.map((r, i) => (
            <tr key={i}>
              {columns.map((c) => (
                <td key={c.key} style={{ ...CELL, textAlign: c.align ?? "left" }}>
                  {r[c.key] == null || r[c.key] === "" ? "—" : String(r[c.key])}
                </td>
              ))}
            </tr>
          ))
        )}
      </tbody>
    </table>
  );
}

export function SheetNote({ children }: { children: ReactNode }) {
  return <div style={{ margin: "10px 0", color: "var(--color-text-secondary)", fontSize: "var(--font-size-xs)" }}>{children}</div>;
}

/** 서명·직인 칸. */
export function SheetSignature({ labels, date }: { labels: string[]; date?: string }) {
  return (
    <div style={{ marginTop: 28, display: "flex", justifyContent: "space-between", alignItems: "flex-end", gap: 16 }}>
      <div>{date ? `발행일 ${date}` : null}</div>
      <div style={{ display: "flex", gap: 8 }}>
        {labels.map((l) => (
          <div key={l} style={{ width: 92, border: "1px solid var(--color-border-strong)", textAlign: "center" }}>
            <div style={{ background: "var(--color-bg-header)", borderBottom: "1px solid var(--color-border-strong)", padding: 2 }}>{l}</div>
            <div style={{ height: 52 }} />
          </div>
        ))}
      </div>
    </div>
  );
}

/** 문서 상태가 발행 전이면 비치는 「미리보기」 글자. */
export function SheetWatermark({ text }: { text: string }) {
  return (
    <div
      style={{
        border: "2px dashed var(--color-warning)",
        color: "var(--color-warning)",
        textAlign: "center",
        fontWeight: 700,
        padding: 4,
        marginBottom: 12,
      }}
    >
      {text}
    </div>
  );
}

/** 크게 찍는 한 줄(Tag 의 코일 번호 등). */
export function SheetBigText({ children, caption }: { children: ReactNode; caption?: string }) {
  return (
    <div style={{ borderBottom: "1px solid var(--color-border-strong)", marginBottom: 6, paddingBottom: 4 }}>
      {caption ? <div style={{ fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" }}>{caption}</div> : null}
      <div style={{ fontFamily: "monospace", fontSize: 22, fontWeight: 700, letterSpacing: 1 }}>{children}</div>
    </div>
  );
}

/** 작은 라벨·값 격자(Tag 처럼 좁은 용지용, 표 테두리 없이 2열). */
export function SheetMiniFields({ fields }: { fields: [label: string, value: ReactNode][] }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "3px 10px", fontFamily: "monospace", fontSize: "var(--font-size-xs)" }}>
      {fields.map(([label, value]) => (
        <div key={label}>
          <div style={{ color: "var(--color-text-secondary)" }}>{label}</div>
          <div style={{ fontWeight: 600 }}>{value ?? "—"}</div>
        </div>
      ))}
    </div>
  );
}

/** 화면 안에 용지 모양을 작게 보일 때의 테두리 상자(인쇄하지 않는 미리보기). */
export function SheetFrame({ children, width }: { children: ReactNode; width: number }) {
  return (
    <div style={{ width, maxWidth: "100%", boxSizing: "border-box", border: "1px solid var(--color-border-strong)", background: "var(--color-bg)", padding: "10px 12px" }}>
      {children}
    </div>
  );
}
