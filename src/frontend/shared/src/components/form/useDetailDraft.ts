"use client";

/**
 * 상세 폼 초안(draft) 훅 — 화면 루트를 다시 그리지 않고 상세 입력을 받는다(Screen-Performance-Guide R12).
 *
 * 화면 루트가 상세 입력 값을 들고 있으면 글자마다 루트와 그 아래 부품이 다시 그려진다. 이 훅은 초안을 훅을 쓰는
 * 폼 컴포넌트 안에만 두고, 루트에는 행에 반영하는 시점(blur·저장·행 전환)에만 알린다.
 *
 * - `draft`·`setField`: 폼 컴포넌트가 입력 칸에 연결한다. 글자 입력은 이 폼 컴포넌트만 다시 그린다.
 * - `containerProps`: 폼 바깥 래퍼에 펼친다. 포커스가 폼 밖으로 나갈 때(blur) 초안을 `onCommit` 으로 넘긴다.
 * - `handle`: `useImperativeHandle(ref, () => handle, [handle])` 로 루트에 노출한다. 저장 단추가 폼 밖에 있어도 루트가 `getDraft()`·`isDirty()` 로 읽는다.
 * - 행 전환(`rowKey` 가 바뀜): 아직 반영하지 않은 초안은 이전 행 기준으로 `onCommit` 을 부른 뒤 새 행으로 바꾼다.
 * - 같은 행의 `row` 가 밖에서 새로 오면(저장 뒤 다시 읽기 등): 고친 칸이 없을 때만 새 값으로 바꾼다. 고치는 중이면 입력을 지킨다.
 *
 * 폼 컴포넌트는 `memo` 로 감싸 루트가 다른 이유로 다시 그려져도 건너뛰게 한다(`ColumnDetailForm` 방식).
 */
import { useCallback, useLayoutEffect, useMemo, useRef, useState, type FocusEvent } from "react";

export interface DetailDraftHandle<T extends object> {
  /** 지금 초안(반영 전 입력 포함). 행이 없으면 null. */
  getDraft(): T | null;
  /** 마지막 반영·초기화 뒤 고친 칸이 있는지. */
  isDirty(): boolean;
  /** 초안을 지금 `onCommit` 으로 넘긴다(고친 칸이 없으면 부르지 않는다). 저장 직전에 부른다. */
  commit(): void;
  /** 초안을 `next` 로 바꾸고 고친 표시를 지운다(`onCommit` 을 부르지 않는다). 저장 성공 뒤·신규 행 열기에 쓴다. */
  reset(next: T | null): void;
}

export interface UseDetailDraftOptions<T extends object> {
  /** 초안을 행에 반영할 때 불린다 — blur·`commit()`·행 전환 시. 인자는 반영할 초안과 그 초안이 시작된 행. */
  onCommit?: (draft: T, row: T) => void;
  /**
   * 행 식별(필수). 이 값이 바뀌면 행 전환으로 본다. 참조가 아니라 ID 같은 값을 준다 —
   * 저장 뒤 다시 읽어 같은 행의 객체가 새로 와도 행 전환으로 오인하지 않게 한다.
   */
  rowKey: (row: T) => unknown;
}

export interface UseDetailDraftResult<T extends object> {
  draft: T | null;
  /** 초안에 반영 전 변경이 있는지(렌더용). */
  dirty: boolean;
  setField: <K extends keyof T>(key: K, value: T[K]) => void;
  /** 초안을 통째로 바꾼다(여러 칸 한 번에). 고친 표시가 켜진다. */
  setDraft: (next: T) => void;
  containerProps: { onBlur: (e: FocusEvent<HTMLElement>) => void };
  /** 안정된 참조 — `useImperativeHandle` 에 넘긴다. */
  handle: DetailDraftHandle<T>;
}

function shallowEqual(a: object | null, b: object | null): boolean {
  if (a === b) return true;
  if (!a || !b) return false;
  const ak = Object.keys(a);
  if (ak.length !== Object.keys(b).length) return false;
  for (const k of ak) {
    if (!Object.is((a as Record<string, unknown>)[k], (b as Record<string, unknown>)[k])) return false;
  }
  return true;
}

export function useDetailDraft<T extends object>(
  row: T | null | undefined,
  options: UseDetailDraftOptions<T>
): UseDetailDraftResult<T> {
  const current = row ?? null;
  const [draft, setDraftState] = useState<T | null>(current);
  const [, setVersion] = useState(0);
  const draftRef = useRef<T | null>(current);
  /** 마지막 반영·초기화 시점의 값 — 고친 칸 판정 기준. */
  const baseRef = useRef<T | null>(current);
  const optionsRef = useRef(options);
  optionsRef.current = options;

  const keyOf = (r: T | null) => (r == null ? null : optionsRef.current.rowKey(r));
  const lastKeyRef = useRef<unknown>(keyOf(current));

  const isDirty = useCallback(() => !shallowEqual(draftRef.current, baseRef.current), []);

  const commit = useCallback(() => {
    const cur = draftRef.current;
    const base = baseRef.current;
    if (cur == null || base == null || shallowEqual(cur, base)) return;
    baseRef.current = cur;
    setVersion((n) => n + 1); // 렌더용 dirty 를 새로 읽게 한다(onCommit 이 props 를 안 바꿔도).
    optionsRef.current.onCommit?.(cur, base);
  }, []);

  const reset = useCallback((next: T | null) => {
    draftRef.current = next;
    baseRef.current = next;
    setDraftState(next);
  }, []);

  // 행 전환·밖에서 온 새 행 값 처리 — 칠하기 전에 끝내도록 layout effect 로 한다.
  useLayoutEffect(() => {
    const key = keyOf(current);
    if (!Object.is(key, lastKeyRef.current)) {
      commit();
      lastKeyRef.current = key;
      reset(current);
      return;
    }
    if (!isDirty() && !shallowEqual(current, baseRef.current)) reset(current);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- keyOf 는 ref 만 읽는다
  }, [current, commit, isDirty, reset]);

  const setDraft = useCallback((next: T) => {
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const setField = useCallback(<K extends keyof T>(key: K, value: T[K]) => {
    const cur = draftRef.current;
    if (cur == null || Object.is(cur[key], value)) return;
    const next = { ...cur, [key]: value };
    draftRef.current = next;
    setDraftState(next);
  }, []);

  const onBlur = useCallback(
    (e: FocusEvent<HTMLElement>) => {
      // 폼 안에서 칸만 옮길 때는 반영하지 않는다 — 포커스가 폼 밖으로 나갈 때만.
      if (e.relatedTarget instanceof Node && e.currentTarget.contains(e.relatedTarget)) return;
      commit();
    },
    [commit]
  );

  const containerProps = useMemo(() => ({ onBlur }), [onBlur]);
  const handle = useMemo<DetailDraftHandle<T>>(
    () => ({ getDraft: () => draftRef.current, isDirty, commit, reset }),
    [isDirty, commit, reset]
  );

  return {
    draft,
    dirty: !shallowEqual(draft, baseRef.current),
    setField,
    setDraft,
    containerProps,
    handle,
  };
}
