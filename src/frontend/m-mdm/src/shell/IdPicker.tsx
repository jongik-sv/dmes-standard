"use client";

/**
 * ID 고르기 — 검색 칸·[찾기]와 그 아래 드롭다운 목록. 룰 화면의 룰 고르기(`dme/ruleEdit/RulePicker`)를 일반화해
 * 코드 편집·항목 편집·룰 세트 편집이 같은 방식으로 ID 를 고르게 한다.
 *
 * 찾은 후보는 칸 아래에 겹쳐 띄우므로 본문을 밀지 않는다. 한 줄에 후보 하나(ID·이름·종류·상태)를 보이고
 * ↑↓ 로 옮기고 Enter 로 열며 Esc·바깥 누름으로 닫는다. `limit` 건이 차면 좁혀 검색하라고 안내한다.
 * Enter 는 keydown 에서 막으므로 조회영역(`SearchArea` form) 안에 두어도 조회가 함께 돌지 않는다.
 * 화면 모듈은 Mantine 을 쓸 수 없어 드롭다운은 인라인 스타일로 그린다(`badgeStyle` 과 같은 이유).
 */
import { useEffect, useRef, useState, type CSSProperties, type KeyboardEvent } from "react";

import { Button, Input } from "@dk-oasis/shared/form";

import { badgeStyle, type MdmBadgeTone } from "./badge-style";

/** 드롭다운 한 줄. `kind` 는 룰 종류처럼 있을 때만 칸을 둔다. */
export interface IdPickRow {
  id: string;
  name: string;
  /** 원천이 MDM 이 아니면 이름 뒤에 "· 외부" 를 붙인다. */
  external?: boolean;
  kind?: string;
  status?: string;
}

/** 마루 코드·데이터·룰·세트가 함께 쓰는 상태 값. 모르는 값은 그대로 보인다. */
const STATUS_LABEL: Record<string, string> = { CREATED: "작성", INUSE: "사용 중", DEPRECATED: "폐기" };
const STATUS_TONE: Record<string, MdmBadgeTone> = { CREATED: "info", INUSE: "success", DEPRECATED: "muted" };

const LIST_STYLE: CSSProperties = {
  position: "absolute",
  top: "calc(100% + 4px)",
  left: 0,
  zIndex: 1000,
  width: 560,
  maxWidth: "calc(100vw - 32px)",
  maxHeight: 360,
  overflowY: "auto",
  padding: "4px 0",
  background: "var(--color-bg)",
  border: "1px solid var(--color-border)",
  borderRadius: "var(--radius-sm)",
  boxShadow: "var(--shadow-dropdown)",
};

const ROW_STYLE: CSSProperties = {
  display: "grid",
  alignItems: "center",
  gap: "var(--spacing-sm)",
  width: "100%",
  padding: "6px var(--spacing-sm)",
  border: 0,
  background: "transparent",
  color: "var(--color-text)",
  font: "inherit",
  textAlign: "left",
  cursor: "pointer",
};

const ELLIPSIS: CSSProperties = { overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" };

const NOTE_STYLE: CSSProperties = { padding: "6px var(--spacing-sm)", color: "var(--color-text-muted)" };

export interface IdPickerProps {
  /** 칸 앞 굵은 글자(상단 바용). 조회영역에서는 `SearchField` 라벨이 대신하므로 뺀다. */
  label?: string;
  placeholder: string;
  /** 없을 때 문구의 대상 — "찾은 {noun}이(가) 없습니다." */
  noun: string;
  /** `${testId}-keyword`·`${testId}-list`·`${testId}-${id}` */
  testId: string;
  search: (keyword: string) => Promise<IdPickRow[]>;
  /** 이 건수가 차면 좁혀 검색하라고 안내한다. 검색 쪽이 이 건수에서 자른다. */
  limit?: number;
  onPick: (id: string) => void;
  onError: (message: string) => void;
  inputWidth?: number;
}

/** 이미 받아 둔 후보를 화면에서 거른다 — ID·이름 부분 일치(대소문자 무시), 앞에서 `limit` 건. 빈 글자면 앞에서부터. */
export function filterIdPicks(rows: readonly IdPickRow[], keyword: string, limit: number): IdPickRow[] {
  const k = keyword.trim().toLowerCase();
  const hit = k ? rows.filter((r) => r.id.toLowerCase().includes(k) || r.name.toLowerCase().includes(k)) : rows;
  return hit.slice(0, limit);
}

/** 받침 여부로 주격 조사를 고른다(룰이·세트가). */
function subjectOf(noun: string): string {
  const last = noun.charCodeAt(noun.length - 1);
  const hasFinal = last >= 0xac00 && last <= 0xd7a3 && (last - 0xac00) % 28 !== 0;
  return `${noun}${hasFinal ? "이" : "가"}`;
}

export function IdPicker({ label, placeholder, noun, testId, search, limit, onPick, onError, inputWidth = 220 }: IdPickerProps) {
  const [keyword, setKeyword] = useState("");
  const [picks, setPicks] = useState<IdPickRow[] | null>(null);
  const [active, setActive] = useState(0);
  const boxRef = useRef<HTMLDivElement>(null);
  const listRef = useRef<HTMLDivElement>(null);
  /** 요청 순번(Local-Rules §11·§15) — 글자를 바꾸거나 다시 찾은 뒤 늦게 온 옛 결과가 목록을 다시 열거나 덮지 않게. */
  const findSeq = useRef(0);
  const listId = `${testId}-list`;

  const close = () => setPicks(null);

  const find = async () => {
    const seq = ++findSeq.current;
    try {
      const rows = await search(keyword.trim());
      if (seq !== findSeq.current) return;
      setPicks(rows);
      setActive(0);
    } catch (e) {
      if (seq === findSeq.current) onError(e instanceof Error ? e.message : String(e));
    }
  };

  const pick = (id: string) => {
    close();
    onPick(id);
  };

  // 목록이 열려 있을 때만 바깥 누름으로 닫는다.
  useEffect(() => {
    if (!picks) return;
    const onDown = (e: MouseEvent) => {
      if (!boxRef.current?.contains(e.target as Node)) close();
    };
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [picks]);

  // ↑↓ 로 옮긴 줄이 목록 밖이면 보이게 굴린다.
  useEffect(() => {
    listRef.current?.querySelector<HTMLElement>(`[data-index="${active}"]`)?.scrollIntoView?.({ block: "nearest" });
  }, [active]);

  const onKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    const count = picks?.length ?? 0;
    if (e.key === "ArrowDown" && count > 0) {
      e.preventDefault();
      setActive((i) => (i + 1) % count);
    } else if (e.key === "ArrowUp" && count > 0) {
      e.preventDefault();
      setActive((i) => (i - 1 + count) % count);
    } else if (e.key === "Escape" && picks) {
      e.preventDefault();
      close();
    } else if (e.key === "Enter") {
      // 조회영역 form 의 implicit submit(조회)도 여기서 막힌다.
      e.preventDefault();
      if (picks && count > 0) pick(picks[active].id);
      else void find();
    }
  };

  const withKind = !!picks?.some((p) => p.kind);
  const rowColumns = withKind ? "180px minmax(0, 1fr) 40px 64px" : "180px minmax(0, 1fr) 64px";

  return (
    <div ref={boxRef} style={{ position: "relative", display: "flex", alignItems: "center", gap: "var(--spacing-sm)" }}>
      {label && <span style={{ fontWeight: 600 }}>{label}</span>}
      <Input
        data-testid={`${testId}-keyword`}
        value={keyword}
        placeholder={placeholder}
        onChange={(v) => {
          setKeyword(v);
          findSeq.current++;
          // 글자를 바꾸면 지난 결과는 맞지 않으므로 닫는다 — Enter 가 다시 검색하게.
          if (picks) close();
        }}
        onKeyDown={onKeyDown}
        role="combobox"
        aria-expanded={!!picks}
        aria-controls={listId}
        aria-autocomplete="list"
        style={{ width: inputWidth }}
      />
      <Button onClick={() => void find()}>찾기</Button>
      {picks && (
        <div ref={listRef} id={listId} data-testid={listId} role="listbox" style={LIST_STYLE}>
          {picks.length === 0 ? (
            <div style={NOTE_STYLE}>{`찾은 ${subjectOf(noun)} 없습니다.`}</div>
          ) : (
            <>
              {picks.map((p, i) => (
                <button
                  key={p.id}
                  type="button"
                  role="option"
                  aria-selected={i === active}
                  data-index={i}
                  data-testid={`${testId}-${p.id}`}
                  onMouseEnter={() => setActive(i)}
                  onClick={() => pick(p.id)}
                  style={{
                    ...ROW_STYLE,
                    gridTemplateColumns: rowColumns,
                    background: i === active ? "var(--color-bg-hover)" : "transparent",
                  }}
                >
                  <span style={{ ...ELLIPSIS, fontFamily: "var(--font-family-mono)", fontWeight: 600 }}>{p.id}</span>
                  <span style={ELLIPSIS} title={p.name}>
                    {p.name}
                    {p.external && <span style={{ color: "var(--color-text-muted)" }}> · 외부</span>}
                  </span>
                  {withKind && <span style={{ color: "var(--color-text-secondary)" }}>{p.kind ?? ""}</span>}
                  {p.status ? (
                    <span style={{ justifySelf: "start", ...badgeStyle(STATUS_TONE[p.status] ?? "neutral") }}>
                      {STATUS_LABEL[p.status] ?? p.status}
                    </span>
                  ) : (
                    <span />
                  )}
                </button>
              ))}
              {limit !== undefined && picks.length >= limit && (
                <div style={{ ...NOTE_STYLE, borderTop: "1px solid var(--color-border-light)" }}>
                  {limit}건까지 보입니다. 더 좁혀 검색하세요.
                </div>
              )}
            </>
          )}
        </div>
      )}
    </div>
  );
}
