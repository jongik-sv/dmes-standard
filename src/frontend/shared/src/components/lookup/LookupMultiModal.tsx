"use client";

/**
 * 검색해서 여러 개 고르기 팝업 — 검색어 → 결과 목록(체크) → 고른 것 칩 → [확인]. 사람·부서 등 { code, name } 여러 개를 한 번에 고를 때 쓴다.
 * - 검색은 [조회] 또는 Enter 로만 한다(입력마다 부르지 않는다). minKeywordLength 보다 짧으면 부르지 않고 안내한다.
 * - 늦게 온 응답은 버린다(마지막 검색만 반영). 검색이 실패하면 목록 아래에 문구를 보인다.
 * - maxSelect 에 닿으면 고르지 않은 행의 체크가 막힌다. excludeCodes 의 행은 결과에서 뺀다(예: 나 자신).
 * - [확인]은 onConfirm(고른 행)만 부르고 스스로 닫지 않는다 — 호출자가 저장·알림 뒤 open 을 내린다. onConfirm 이 Promise 면 끝날 때까지 단추를 막는다
 *   (두 번 눌러도 한 번만 부른다). onConfirm 이 행 목록을 돌려주면 고른 것을 그 목록으로 바꾼다(일부 실패한 것만 남겨 다시 시도하게).
 * - 검색 중에는 [조회]·Enter 를 무시한다.
 * - 열릴 때마다 검색어·결과·고른 것을 비운다.
 */
import { useCallback, useEffect, useRef, useState, type ReactNode } from "react";
import { TextInput } from "@mantine/core";

import { Button, Checkbox } from "../form";
import { Modal } from "../modal";

export interface LookupMultiRow {
  code: string;
  name: string;
  /** 이름 옆 보조 글(부서명 등). */
  detail?: string;
}

export interface LookupMultiModalProps {
  open: boolean;
  title: string;
  /** 검색어 → 결과 행. 실패는 Error(message) 로 던진다. */
  search: (keyword: string) => Promise<LookupMultiRow[]>;
  /** [확인] — 고른 행(고른 순서). 닫기는 호출자가 한다. 행 목록을 돌려주면 고른 것을 그것으로 바꾼다. */
  onConfirm: (rows: LookupMultiRow[]) => void | readonly LookupMultiRow[] | Promise<void | readonly LookupMultiRow[]>;
  /** 취소·닫기 단추·Escape·바깥 누름. */
  onClose: () => void;
  /** 고를 수 있는 최대 개수(기본 제한 없음). */
  maxSelect?: number;
  /** 검색어 최소 글자 수(앞뒤 공백 제외, 기본 1). */
  minKeywordLength?: number;
  /** 결과에서 뺄 code(예: 로그인 사용자). */
  excludeCodes?: readonly string[];
  placeholder?: string;
  /** [확인] 단추 글(기본 「확인」). */
  confirmLabel?: string;
  /** 검색 칸 위 안내. */
  description?: ReactNode;
  testId?: string;
}

const CSS = `
.cm-lookup-multi { display: flex; flex-direction: column; gap: var(--spacing-sm, 8px); min-height: 320px; }
.cm-lookup-multi__desc { margin: 0; color: var(--color-text-secondary); font-size: var(--font-size-sm); line-height: 1.5; }
.cm-lookup-multi__bar { display: flex; gap: var(--spacing-xs, 6px); align-items: center; }
.cm-lookup-multi__bar > :first-child { flex: 1; }
.cm-lookup-multi__hint { margin: 0; color: var(--color-text-muted); font-size: var(--font-size-sm); }
.cm-lookup-multi__hint[data-error="true"] { color: var(--color-danger); }
.cm-lookup-multi__list { flex: 1; min-height: 160px; max-height: 260px; overflow: auto; margin: 0; padding: 4px; list-style: none; border: 1px solid var(--color-border); border-radius: var(--radius-sm); }
.cm-lookup-multi__row { display: flex; align-items: center; padding: 4px 6px; border-radius: var(--radius-sm); }
.cm-lookup-multi__row:hover { background: var(--color-bg-hover); }
.cm-lookup-multi__detail { margin-left: 6px; color: var(--color-text-muted); font-size: var(--font-size-sm); }
.cm-lookup-multi__picked { display: flex; flex-wrap: wrap; gap: 4px; align-items: center; min-height: 26px; }
.cm-lookup-multi__count { color: var(--color-text-secondary); font-size: var(--font-size-sm); margin-right: 4px; }
.cm-lookup-multi__chip { display: inline-flex; align-items: center; gap: 2px; padding: 1px 4px 1px 8px; border-radius: 999px; background: var(--color-primary-soft); color: var(--color-primary); font-size: var(--font-size-sm); }
.cm-lookup-multi__chip button { width: 18px; height: 18px; padding: 0; border: 0; border-radius: 50%; background: transparent; color: inherit; cursor: pointer; line-height: 1; }
.cm-lookup-multi__chip button:hover { background: var(--color-bg-hover); }
`;

export function LookupMultiModal({
  open,
  title,
  search,
  onConfirm,
  onClose,
  maxSelect,
  minKeywordLength = 1,
  excludeCodes,
  placeholder = "검색어 입력",
  confirmLabel = "확인",
  description,
  testId,
}: LookupMultiModalProps) {
  const [keyword, setKeyword] = useState("");
  const [rows, setRows] = useState<LookupMultiRow[] | null>(null);
  const [hint, setHint] = useState<{ text: string; error: boolean } | null>(null);
  const [loading, setLoading] = useState(false);
  const [picked, setPicked] = useState<LookupMultiRow[]>([]);
  const [busy, setBusy] = useState(false);
  const searchRef = useRef(search);
  searchRef.current = search;
  const generation = useRef(0);
  // 같은 렌더 안의 두 번째 Enter·클릭도 막도록 상태와 함께 ref 로 본다.
  const loadingRef = useRef(false);
  const busyRef = useRef(false);

  useEffect(() => {
    generation.current += 1;
    loadingRef.current = false;
    if (!open) return;
    setKeyword("");
    setRows(null);
    setHint(null);
    setLoading(false);
    setPicked([]);
    setBusy(false);
    busyRef.current = false;
  }, [open]);

  const runSearch = useCallback(async () => {
    if (loadingRef.current) return;
    const kw = keyword.trim();
    if (kw.length < minKeywordLength) {
      setHint({ text: `${minKeywordLength}자 이상 입력해 주세요.`, error: false });
      return;
    }
    const gen = ++generation.current;
    loadingRef.current = true;
    setLoading(true);
    setHint(null);
    try {
      const found = await searchRef.current(kw);
      if (gen !== generation.current) return;
      const skip = new Set(excludeCodes ?? []);
      const visible = found.filter((r) => !skip.has(r.code));
      setRows(visible);
      if (visible.length === 0) setHint({ text: "검색 결과가 없습니다.", error: false });
    } catch (e) {
      if (gen !== generation.current) return;
      setRows([]);
      setHint({ text: e instanceof Error && e.message ? e.message : "검색하지 못했습니다.", error: true });
    } finally {
      if (gen === generation.current) {
        loadingRef.current = false;
        setLoading(false);
      }
    }
  }, [keyword, minKeywordLength, excludeCodes]);

  const full = maxSelect != null && picked.length >= maxSelect;
  const toggle = (row: LookupMultiRow) =>
    setPicked((prev) => (prev.some((p) => p.code === row.code) ? prev.filter((p) => p.code !== row.code) : full ? prev : [...prev, row]));

  const confirm = async () => {
    if (picked.length === 0 || busyRef.current) return;
    busyRef.current = true;
    setBusy(true);
    try {
      const keep = await onConfirm(picked);
      if (keep) setPicked([...keep]);
    } catch {
      /* 알림은 호출자 몫 — 고른 것을 그대로 두고 다시 시도할 수 있게 한다 */
    } finally {
      busyRef.current = false;
      setBusy(false);
    }
  };

  const footer = (
    <>
      <Button onClick={onClose} disabled={busy}>
        취소
      </Button>
      <Button variant="primary" onClick={() => void confirm()} disabled={picked.length === 0 || busy} data-action="lookup-multi-confirm">
        {busy ? "처리 중…" : picked.length > 0 ? `${confirmLabel} (${picked.length})` : confirmLabel}
      </Button>
    </>
  );

  return (
    <Modal open={open} title={title} onClose={busy ? undefined : onClose} size="sm" footer={footer}>
      <style>{CSS}</style>
      <div className="cm-lookup-multi" data-testid={testId}>
        {description && <p className="cm-lookup-multi__desc">{description}</p>}
        <div className="cm-lookup-multi__bar">
          <TextInput
            value={keyword}
            placeholder={placeholder}
            aria-label="검색어"
            data-autofocus
            onChange={(e) => setKeyword(e.currentTarget.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                void runSearch();
              }
            }}
          />
          <Button onClick={() => void runSearch()} disabled={loading} data-action="lookup-multi-search">
            {loading ? "조회 중…" : "조회"}
          </Button>
        </div>
        {hint && (
          <p className="cm-lookup-multi__hint" data-error={hint.error ? "true" : undefined} role={hint.error ? "alert" : undefined}>
            {hint.text}
          </p>
        )}
        <ul className="cm-lookup-multi__list" aria-label="검색 결과">
          {(rows ?? []).map((r) => {
            const checked = picked.some((p) => p.code === r.code);
            return (
              <li key={r.code} className="cm-lookup-multi__row" data-code={r.code}>
                {/* shared form Checkbox 의 label 은 문자열뿐이라 보조 글(부서명)은 옆에 따로 그린다. */}
                <Checkbox checked={checked} disabled={!checked && full} onChange={() => toggle(r)} label={r.name} />
                {r.detail && <span className="cm-lookup-multi__detail">{r.detail}</span>}
              </li>
            );
          })}
        </ul>
        <div className="cm-lookup-multi__picked" aria-label="고른 항목">
          <span className="cm-lookup-multi__count">
            고른 항목 {picked.length}
            {maxSelect != null ? `/${maxSelect}` : ""}
          </span>
          {picked.map((p) => (
            <span key={p.code} className="cm-lookup-multi__chip" data-code={p.code}>
              {p.name}
              <button type="button" aria-label={`${p.name} 빼기`} onClick={() => toggle(p)} disabled={busy}>
                ×
              </button>
            </span>
          ))}
        </div>
      </div>
    </Modal>
  );
}
