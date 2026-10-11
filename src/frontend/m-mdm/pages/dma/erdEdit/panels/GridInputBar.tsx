"use client";

/**
 * 컬럼 그리드 아래 입력 칸(S2-6) — 새 컬럼 논리명·논리명 미리보기(300ms)·고른 컬럼의 논리명 바꾸기·도메인 적용.
 * shared AgDataGrid 의 칸 편집기는 글자마다 콜백을 주지 않으므로, 입력 중 미리보기가 필요한 입력을 그리드 밖에 둔다(조사 A E4).
 * - Enter(그리드·입력 칸의 Ctrl/⌘+Enter 와 같다): 새 컬럼. 논리명만 보내고 물리명·도메인은 서버가 채운다(스펙 4.1).
 *   Ctrl/⌘+Shift+Enter 로 연 경우 PK 컬럼이다. 새 컬럼 id 는 화면이 정한다(같은 묶음의 setPrimaryKey 가 가리킨다).
 * - 서버가 NEEDS_CHOICE 로 거절하면 토막 고르기 창을 띄우고, 고른 물리명과 그 추천 도메인을 넣어 같은 묶음을 다시 보낸다.
 * - 미리보기는 입력이 300ms 멈춘 뒤 한 번 부르고, 요청 순번으로 늦은 응답을 버린다(Local-Rules §20·§34·§37).
 * - 도메인 찾기는 erdEdit 에 목록 액션이 없어 컬럼 사전 화면(columnMng)처럼 룰 편집의 도메인 검색(target=DOMAIN)을 쓴다.
 */
import { useCallback, useEffect, useRef, useState, type CSSProperties, type MutableRefObject, type ReactNode } from "react";

import { Badge, Button, Checkbox, Input } from "@dk-oasis/shared/form";
import { callOasisAt, type OasisCallOptions } from "@dk-oasis/shared/http";

import { DomainField, type DomainRow } from "@/domain";
import { MDM_OASIS_BASE, plainError } from "@/oasis-screen";

import { previewName } from "../api";
import { isAuditColumn } from "../audit-columns";
import type { ErdEditContext } from "../edit-context";
import { shortReason } from "../state/permissions";
import type { ErdColumnStatus, ErdCommandJson, ErdModelJson, ErdNamePreview } from "../types";
import { TOKEN_STATUS_LABEL, TokenChoiceModal, toTokenChoices, tokenTone, type TokenChoice } from "./TokenChoiceModal";

export type AddKind = "add" | "addPk";
/** ColumnGrid 의 그리드 키가 부른다. 글자가 있으면 보내고, 없으면 입력 칸으로 초점을 옮긴다. */
export interface BarHandle { trigger(kind: AddKind): void }

export const PREVIEW_DEBOUNCE_MS = 300;

const errText = (e: unknown): string => (e instanceof Error ? e.message : String(e));

/** 화면이 정하는 요소 id — 서버 ErdIds 규칙(^[a-z]-[0-9a-zA-Z-]{1,48}$)을 지킨다. crypto.randomUUID 는 http 내부 주소에서 없을 수 있어 쓰지 않는다. */
export function newElementId(prefix: "c", random: () => number = Math.random, now: () => number = Date.now): string {
  let s = "";
  for (let i = 0; i < 8; i++) s += Math.floor(random() * 36).toString(36);
  return `${prefix}-${now().toString(36)}-${s}`;
}

export interface NewColumn { id: string; logical: string; phys?: string; domainId?: number | null }

/** 새 컬럼 묶음. PK 면 마지막 PK 컬럼 다음 자리에 넣고 같은 묶음에서 PK 에 더한다(키 이름은 서버가 둔다). */
export function addColumnBatch(model: ErdModelJson, tableId: string, col: NewColumn, pk: boolean): ErdCommandJson[] {
  const add: ErdCommandJson = { op: "addColumn", id: col.id, table: tableId, logical: col.logical };
  if (col.phys) add.phys = col.phys;
  if (col.domainId != null) add.domainId = col.domainId;
  if (!pk) return [add];
  const key = Object.values(model.keys).find((k) => k.table === tableId && k.kind === "PK");
  const pkCols = key?.columns ?? [];
  const order = model.tables[tableId]?.columnOrder ?? [];
  add.position = Math.max(-1, ...pkCols.map((c) => order.indexOf(c))) + 1;
  return [add, { op: "setPrimaryKey", table: tableId, columns: [...pkCols, col.id] }];
}

/** NEEDS_CHOICE 뒤 다시 보낼 묶음 — 같은 id 의 addColumn 에만 phys 와 (비어 있으면) domainId 를 넣는다. */
export function withPhys(commands: ErdCommandJson[], columnId: string, phys: string, domainId: number | null): ErdCommandJson[] {
  return commands.map((c) => {
    if (c.op !== "addColumn" || c.id !== columnId) return c;
    const next: ErdCommandJson = { ...c, phys };
    if (domainId != null && c.domainId == null) next.domainId = domainId;
    return next;
  });
}

const DOMAIN_OASIS: OasisCallOptions = { merge: "result", errorFactory: plainError };

/** 도메인 찾기 — columnMng 과 같이 룰 편집(ruleEdit)의 도메인 검색(target=DOMAIN, 8건)을 쓴다. */
export async function searchErdDomains(keyword: string): Promise<DomainRow[]> {
  const kw = keyword.trim();
  const res = await callOasisAt<{ rows?: DomainRow[] }>(MDM_OASIS_BASE, "ruleEdit", "search", { target: "DOMAIN", keyword: kw === "" ? null : kw },
    undefined, DOMAIN_OASIS);
  return res.rows ?? [];
}

interface PreviewState { forText: string; preview: ErdNamePreview | null; error: string | null }

/** 300ms 멈춘 뒤 compare{logical}. 순번이 바뀐 뒤 온 응답(옛 글자·닫힌 칸)은 버린다. */
function useNamePreview(text: string, enabled: boolean): PreviewState | null {
  const [state, setState] = useState<PreviewState | null>(null);
  const seq = useRef(0);
  const want = enabled ? text.trim() : "";
  useEffect(() => {
    const mine = ++seq.current;
    if (want === "") {
      setState(null);
      return;
    }
    const timer = setTimeout(() => {
      previewName({ logical: want })
        .then((p) => {
          if (seq.current === mine) setState({ forText: want, preview: p, error: null });
        })
        .catch((e) => {
          if (seq.current === mine) setState({ forText: want, preview: null, error: errText(e) });
        });
    }, PREVIEW_DEBOUNCE_MS);
    return () => clearTimeout(timer);
  }, [want]);
  useEffect(() => () => {
    seq.current += 1;
  }, []);
  return state;
}

const settledStatus = (s: string) => s === "MATCHED" || s === "SYNONYM";

interface Choice { tokens: TokenChoice[]; logical: string; label: string; newId: string; build(phys: string, domainId: number | null): ErdCommandJson[] }

const BAR: CSSProperties = { flex: "none", display: "flex", flexDirection: "column", gap: "var(--spacing-xs)",
  padding: "var(--spacing-xs) var(--spacing-sm)", borderTop: "1px solid var(--color-border)", background: "var(--color-bg)" };
const ROW: CSSProperties = { display: "flex", alignItems: "center", gap: "var(--spacing-xs)", minWidth: 0 };
const GROW: CSSProperties = { flex: 1, minWidth: 0 };
const LINE: CSSProperties = { display: "flex", flexWrap: "wrap", alignItems: "center", gap: "var(--spacing-xs)", minHeight: 20,
  fontSize: "var(--font-size-xs)", color: "var(--color-text-secondary)" };
const WARN: CSSProperties = { fontSize: "var(--font-size-xs)", color: "var(--color-warning)" };
const MUTED: CSSProperties = { fontSize: "var(--font-size-xs)", color: "var(--color-text-muted)" };
const ERROR: CSSProperties = { fontSize: "var(--font-size-xs)", color: "var(--color-danger)" };
const TARGET: CSSProperties = { ...GROW, fontSize: "var(--font-size-sm)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

export interface GridInputBarProps {
  ctx: ErdEditContext;
  tableId: string | null;
  /** 그리드에서 고른 컬럼(커서 행). */
  focusColumnId: string | null;
  handle: MutableRefObject<BarHandle | null>;
  /** 새 컬럼을 반영했다 — 그리드가 그 행을 고른다. */
  onAdded(columnId: string): void;
  renderStatus(status: ErdColumnStatus): ReactNode;
}

export function GridInputBar({ ctx, tableId, focusColumnId, handle, onAdded, renderStatus }: GridInputBarProps) {
  const boxRef = useRef<HTMLDivElement>(null);
  const ctxRef = useRef(ctx);
  ctxRef.current = ctx;
  const [text, setText] = useState("");
  const [kind, setKind] = useState<AddKind>("add");
  // [물리명도] 는 기본 끔이다 — 컬럼을 고를 때마다 끔으로 돌아간다(U37). 조용히 물리명이 바뀌어 DB 와 달라지는 일을 막는다.
  // 켠 컬럼 id 를 기억한다 — 다른 컬럼으로 옮기면 값이 달라져 저절로 꺼지므로 한 프레임도 옛 켜짐이 남지 않는다.
  const [physFor, setPhysFor] = useState<string | null>(null);
  const withPhysName = physFor !== null && physFor === focusColumnId;
  const [busy, setBusy] = useState(false);
  const [choice, setChoice] = useState<Choice | null>(null);
  const lastNewId = useRef<string | null>(null);
  const live = useRef({ text, tableId, busy });
  live.current = { text, tableId, busy };

  const model = ctx.state.model;
  const canEdit = ctx.rights.model.ok && tableId !== null;
  const preview = useNamePreview(text, canEdit);
  const shown = preview && preview.forText === text.trim() ? preview : null;
  const settled = shown?.preview && shown.preview.tokens.every((t) => settledStatus(t.status)) ? shown.preview : null;
  const focusCol = focusColumnId && model.columns[focusColumnId]?.table === tableId ? model.columns[focusColumnId] : undefined;
  const focusLocked = !canEdit || !focusCol || (focusColumnId !== null && ctx.pendingIds.has(focusColumnId));

  const focusInput = useCallback(() => {
    boxRef.current?.querySelector<HTMLInputElement>('[data-testid="erd-grid-input"]')?.focus();
  }, []);

  /**
   * rebuild: NEEDS_CHOICE 뒤 다시 보낼 묶음을 그때 모델로 새로 만든다(창이 떠 있는 동안 바뀐 PK 를 덮어쓰지 않게).
   * 없으면 보낸 묶음에 phys 만 넣는다(withPhys).
   */
  const send = useCallback(
    async (commands: ErdCommandJson[], label: string, newId: string | null, logical: string,
      rebuild?: (phys: string, domainId: number | null) => ErdCommandJson[]) => {
      setBusy(true);
      live.current.busy = true;
      lastNewId.current = newId;
      try {
        const out = await ctxRef.current.apply(commands, label);
        if (out.ok) {
          // 보내는 동안 이어서 친 글은 남긴다.
          setText((cur) => (cur.trim() === logical ? "" : cur));
          setKind("add");
          if (newId) onAdded(newId);
          focusInput();
          return;
        }
        const n = out.notice;
        if (n.code === "NEEDS_CHOICE" && n.property === "phys" && newId !== null && n.elementId === newId) {
          setChoice({ tokens: toTokenChoices(n.choices), logical, label, newId,
            build: rebuild ?? ((phys, domainId) => withPhys(commands, newId, phys, domainId)) });
        }
      } finally {
        setBusy(false);
        live.current.busy = false;
      }
    },
    [onAdded, focusInput],
  );

  const add = useCallback(
    (k: AddKind) => {
      const { text: t, tableId: table, busy: b } = live.current;
      const c = ctxRef.current;
      if (!c.rights.model.ok || !table || b) return;
      const logical = t.trim();
      if (logical === "") {
        setKind(k);
        focusInput();
        return;
      }
      const id = newElementId("c");
      const pk = k === "addPk";
      void send(addColumnBatch(c.state.model, table, { id, logical }, pk), pk ? "PK 컬럼 추가" : "컬럼 추가", id, logical,
        (phys, domainId) => addColumnBatch(ctxRef.current.state.model, table, { id, logical, phys, domainId }, pk));
    },
    [send, focusInput],
  );

  useEffect(() => {
    handle.current = { trigger: add };
    return () => {
      handle.current = null;
    };
  }, [handle, add]);

  /** 미리보기에 하나로 정해지지 않은 토막이 있을 때 보내기 전에 고른다. */
  const openTokens = () => {
    const table = tableId;
    const logical = text.trim();
    const k = kind;
    if (!shown?.preview || !table || logical === "") return;
    const id = newElementId("c");
    setChoice({
      tokens: toTokenChoices(shown.preview.tokens), logical, newId: id, label: k === "addPk" ? "PK 컬럼 추가" : "컬럼 추가",
      build: (phys, domainId) => addColumnBatch(ctxRef.current.state.model, table, { id, logical, phys, domainId }, k === "addPk"),
    });
  };

  const onPick = async (phys: string) => {
    const c = choice;
    if (!c) return;
    setChoice(null);
    // 추천 도메인을 읽는 동안 Enter·[추가] 로 같은 이름을 또 보내지 않게 먼저 막는다(send 의 finally 가 푼다).
    setBusy(true);
    live.current.busy = true;
    let domainId: number | null = null;
    try {
      domainId = (await previewName({ phys })).recommendedDomainId;
    } catch {
      domainId = null; // 추천 도메인을 못 읽으면 도메인 없이 보낸다(나중에 도메인 칸에서 고른다)
    }
    await send(c.build(phys, domainId), c.label, c.newId, c.logical);
  };

  const rename = () => {
    if (focusLocked || !focusCol || !focusColumnId) return;
    const logical = text.trim();
    if (logical === "") {
      focusInput();
      return;
    }
    const set: Record<string, unknown> = {};
    if (logical !== focusCol.logical) set.logical = logical;
    if (withPhysName && settled && settled.physName !== focusCol.phys) set.phys = settled.physName;
    if (Object.keys(set).length === 0) {
      ctx.notify("바뀐 값이 없습니다.", "info");
      return;
    }
    // 감사 컬럼 이름으로 바뀌면 행이 숨겨지지 않게 onAdded(그리드의 focusColumn)로 보기를 켜고 초점을 준다.
    void send([{ op: "updateColumn", id: focusColumnId, set }], "논리명 바꾸기", isAuditColumn(set.phys as string | undefined) ? focusColumnId : null, logical);
  };

  const onDomain = (row: DomainRow | null) => {
    if (focusLocked || !focusColumnId) return;
    const cmd: ErdCommandJson = row
      ? { op: "applyDomain", id: focusColumnId, domainId: row.domainId }
      : { op: "updateColumn", id: focusColumnId, set: { domainId: null } };
    void ctxRef.current.apply([cmd], row ? "도메인 적용" : "도메인 해제");
  };

  const recommend = async () => {
    if (focusLocked || !focusCol || !focusColumnId) return;
    const id = focusColumnId;
    try {
      const p = await previewName({ phys: focusCol.phys });
      const c = ctxRef.current;
      if (p.recommendedDomainId == null) {
        c.notify(`${focusCol.phys} 에 맞는 추천 도메인이 없습니다.`, "info");
        return;
      }
      if (p.recommendedDomainId === c.state.model.columns[id]?.domainId) {
        c.notify("이미 추천 도메인입니다.", "info");
        return;
      }
      void c.apply([{ op: "applyDomain", id, domainId: p.recommendedDomainId }], "추천 도메인 적용");
    } catch (e) {
      ctxRef.current.notify(errText(e), "error");
    }
  };

  const domainName = (domainId: number | null | undefined): string =>
    domainId == null ? "" : ctx.status?.domains[String(domainId)]?.name ?? `도메인 ${domainId}`;
  const h = ctx.highlight;
  const hText = h && (model.columns[h.elementId]?.table === tableId || h.elementId === lastNewId.current) ? h.message : null;
  const reason = tableId === null ? "표를 고르면 컬럼을 더할 수 있습니다." : ctx.rights.model.ok ? null : `읽기 전용 — ${shortReason(ctx.rights.model.reason ?? "모델을 고칠 수 없습니다.")}`;
  const needTokens = shown?.preview?.tokens.some((t) => !settledStatus(t.status)) ?? false;

  return (
    <div ref={boxRef} data-testid="erd-grid-bar" style={BAR}>
      <div style={ROW}>
        <Input data-testid="erd-grid-input" aria-label="새 컬럼 논리명" style={GROW} value={text} disabled={!canEdit}
          placeholder={kind === "addPk" ? "PK 컬럼 논리명 — Enter 로 추가" : "새 컬럼 논리명 — Enter·Ctrl+Enter 로 추가"}
          onChange={setText}
          onKeyDown={(e) => {
            if (e.key === "Enter" && !e.nativeEvent.isComposing && e.keyCode !== 229 && !e.ctrlKey && !e.metaKey && !e.altKey) {
              e.preventDefault();
              add(kind);
            } else if (e.key === "Escape") {
              setText("");
              setKind("add");
            }
          }} />
        <Button size="sm" data-testid="erd-grid-add" disabled={!canEdit || busy || text.trim() === ""} onClick={() => add(kind)}>
          {kind === "addPk" ? "PK 추가" : "추가"}
        </Button>
      </div>
      <div data-testid="erd-grid-preview" style={LINE}>
        {shown?.error ? (
          <span style={ERROR}>{shown.error}</span>
        ) : shown?.preview ? (
          <>
            <span data-testid="erd-grid-phys" className="erd-mono">{shown.preview.physName}</span>
            {renderStatus(shown.preview.status)}
            {shown.preview.tokens.map((t) => (
              <Badge key={t.seq} label={`${t.surface} ${t.abbr}`} tone={tokenTone(t.status)} title={TOKEN_STATUS_LABEL[t.status] ?? t.status} />
            ))}
            {shown.preview.recommendedDomainId != null && <span>추천 도메인 {domainName(shown.preview.recommendedDomainId)}</span>}
            {needTokens && (
              <Button size="mini" data-testid="erd-grid-tokens" onClick={openTokens}>
                토막 고르기
              </Button>
            )}
          </>
        ) : (
          <span style={MUTED}>{canEdit && text.trim() !== "" ? "미리보기를 읽는 중입니다." : "논리명을 넣으면 물리명·표준 상태를 미리 봅니다."}</span>
        )}
      </div>
      {hText && (
        <div data-testid="erd-grid-error" role="alert" style={ERROR}>
          {hText}
        </div>
      )}
      {withPhysName && settled && focusCol && settled.physName !== focusCol.phys && (
        <div data-testid="erd-grid-phys-warn" style={WARN}>
          물리명도 {focusCol.phys} → {settled.physName} 으로 바뀝니다(DB 와 달라짐)
        </div>
      )}
      {reason && (
        <div data-testid="erd-grid-reason" style={MUTED}>
          {reason}
        </div>
      )}
      {focusCol && (
        <>
          <div style={ROW}>
            <span data-testid="erd-grid-target" className="erd-mono" style={TARGET}>{focusCol.phys}</span>
            <Button size="sm" data-testid="erd-grid-rename" disabled={focusLocked || busy || text.trim() === ""} onClick={rename}>
              논리명 바꾸기
            </Button>
            <Checkbox aria-label="물리명도 바꾸기" label="물리명도" checked={withPhysName} disabled={focusLocked} onChange={(on) => setPhysFor(on ? focusColumnId : null)} />
          </div>
          <div style={ROW}>
            <span style={MUTED}>도메인</span>
            <DomainField testId="erd-grid-domain" ariaLabel="고른 컬럼 도메인" domainId={focusCol.domainId} label={domainName(focusCol.domainId)}
              search={searchErdDomains} onChange={onDomain} disabled={focusLocked} />
            <Button size="sm" data-testid="erd-grid-recommend" disabled={focusLocked} onClick={() => void recommend()}>
              추천
            </Button>
          </div>
        </>
      )}
      {choice && (
        <TokenChoiceModal opened logical={choice.logical} tokens={choice.tokens} onPick={(phys) => void onPick(phys)} onClose={() => setChoice(null)} />
      )}
    </div>
  );
}
