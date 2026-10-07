"use client";

/**
 * 조회 칸 사용자 기본값 — SearchArea 등록소와 넣기 흐름 (설계 2026-10-07-search-defaults-design §6).
 *
 * - SearchArea 가 컨텍스트로 등록소를 내려주고, 대상 SearchField 가 칸 정보·지금 값 읽기·값 넣기를 등록한다(children 을 들여다보지 않는다).
 * - 넣기는 마운트 때 한 번: SearchArea 의 layout effect(자식 칸 등록이 끝난 같은 커밋)에서 규칙이 있는 칸마다 `onChange(값)` 을 부른다.
 *   지금 값과 같으면 부르지 않는다. 다시 넣기는 하지 않고, 다음 커밋에 값이 다르면 개발 모드에서만 경고한다(§6.2 4단계 —
 *   handoff 처럼 화면 effect 가 정한 값을 덮지 않으려고).
 * - 생략: `defaults={false}`, 분리 창이 이어받은 값으로 시작함(useCarryRestored), pageId 없음, 대화 상자(role="dialog") 안.
 * - 저장소가 아직 준비 중이면 최대 1.5초 기다린다. 그동안 사용자가 고친 칸은 넣지 않는다. 넘으면 넣지 않고 끝낸다.
 * - autoSearch: 넣기가 끝난 다음 커밋의 effect 에서 onSearch 를 한 번 부른다(그 커밋의 onSearch 가 새 상태를 잡고 있다). 이어받은 값으로 시작했으면
 *   부르지 않는다(화면의 useCarryRefetch 가 맡는다). 사용자가 한 조회가 아니므로 emitSearch 를 내지 않는다.
 *   선택지를 기다리며 보류한 값이 있으면 조회를 최대 1.5초 미룬다 — 넣은 뒤에 조회하고, 넘으면 보류를 버리고 지금 값으로 조회한다
 *   (먼저 「전체」로 조회한 뒤 칸만 바뀌면 보이는 조건과 조회한 조건이 다르다).
 * - 초기화(emitSearchReset): 사용자 기본값을 다시 넣는다. 「마지막 조회값」 칸은 넣지 않는다(초기화는 조건을 비우려는 동작).
 * - 조회(emitSearch): 등록된 칸의 지금 값을 마지막 조회값으로 적는다.
 * - 의존 칸(SearchField `dependsOn`): 기준 칸 값이 바뀐 커밋 뒤에 의존 칸을 처음 등록 때 값(코드 기본값)으로 비우고 칸 규칙으로 다시 채운다.
 *   같은 커밋에서 화면이 직접 바꾼 의존 칸은 두고, 새 선택지에 없는 값은 넣지 않는다(보류하지 않는다). 기본값 기능이 꺼진 영역도 비우기는 한다.
 *   화면은 선언만 하고 조건을 비우는 코드를 두지 않는다(설계 §13).
 */
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type Context, type RefObject } from "react";

import { useCarryRestored } from "../../portal-shell/carry-state";
import { getCurrentUser, peekCurrentUser, subscribeCurrentUser } from "../../portal-shell/current-user";
import { useTabPage } from "../../portal-shell/tab-page-context";
import { useIsomorphicLayoutEffect } from "../../hooks/use-isomorphic-layout-effect";
import { subscribeSearch, subscribeSearchReset } from "../search-history-bus";
import { readSearchLastValues, writeSearchLastValues } from "./last-values";
import { resolveSearchDefault, type SearchValueType } from "./rule";
import {
  getPageSearchDefaults,
  getSearchDefaultsStatus,
  preloadSearchDefaults,
  subscribeSearchDefaults,
} from "./store";

/** 저장소가 준비되기를 기다리는 한도(설계 §6.2). */
export const SEARCH_DEFAULTS_WAIT_MS = 1500;
/** 선택지를 서버에서 받는 칸 — 고정 값이 선택지에 나타나기를 기다리는 한도. */
export const SEARCH_DEFAULTS_OPTIONS_WAIT_MS = 10_000;

/**
 * 넣기 방식 — skipLast: 마지막 조회값 규칙 칸은 건너뜀, ignoreTouched: 사용자가 고친 칸도 넣음, onlyIfUnchanged: 기준값에서 바뀐 칸은 건너뜀,
 * clearToInitial: 넣을 값이 없는 칸은 처음 등록 때 값(코드 기본값)으로 비움, noAwait: 선택지에 없는 값을 보류하지 않음,
 * rulesOff: 규칙을 쓰지 않음(기본값 기능이 꺼진 영역의 의존 칸 비우기).
 */
interface ApplyMode {
  skipLast: boolean;
  ignoreTouched: boolean;
  onlyIfUnchanged: boolean;
  clearToInitial?: boolean;
  noAwait?: boolean;
  rulesOff?: boolean;
}

export interface SearchDefaultsFieldInfo {
  /** 칸의 키(`defaultKey ?? name`, 기간 To 는 `{From 키}~to`). scope 접두는 붙지 않은 값이다. */
  fieldKey: string;
  valueType: SearchValueType;
  label: string;
  meta?: string;
  options?: readonly { value: string; label: string }[];
  /** 기간 짝(label="~") — 역할과 상대 칸의 키. */
  pair?: { role: "from" | "to"; partnerKey: string | null };
  /** 기준 칸 키(scope 접두 없음) — 그 칸 값이 바뀌면 이 칸을 비우고 기본값으로 다시 채운다. */
  dependsOn?: string;
}

/** SearchField 가 등록하는 칸 하나. info·getValue·setValue 는 렌더마다 최신으로 바뀐다. */
export interface SearchDefaultsFieldHandle {
  info: SearchDefaultsFieldInfo;
  getValue: () => string;
  /** 화면 onChange 를 부른다(사용자가 고친 것으로 표시하지 않는다). */
  setValue: (value: string) => void;
  /** 사용자가 내장 입력으로 값을 바꿨는가(넣기 전에 고친 칸은 덮지 않는다). */
  touched: boolean;
}

export interface SearchDefaultsAreaApi {
  /** 칸을 등록하고 해제 함수를 돌려준다. */
  register: (handle: SearchDefaultsFieldHandle) => () => void;
  /** 등록된 칸 정보(저장 키는 scope 접두 포함). 설정 창이 쓴다. */
  listFields: () => Array<SearchDefaultsFieldInfo & { storageKey: string }>;
  /** 등록된 칸의 지금 값(저장 키별). 「지금 조건을 기본값으로」 가 쓴다. */
  readValues: () => Record<string, string>;
  /** 지금 저장된 규칙을 다시 넣는다(설정 저장 직후). 조회는 하지 않는다. */
  applyNow: () => void;
  /** 기능이 꺼진 영역인가(설정 아이콘을 그리지 않는다). 마운트 판정 뒤에 정해진다. */
  isDisabled: () => boolean;
  /** 이 영역의 화면 키·scope. */
  pageId: string;
  scope: string;
}

const GLOBAL_KEY = "__dkOasisSearchDefaultsAreaContext__";
const PAIR_GLOBAL_KEY = "__dkOasisSearchFieldPairContext__";
interface GlobalCache {
  [GLOBAL_KEY]?: Context<SearchDefaultsAreaApi | null>;
  [PAIR_GLOBAL_KEY]?: Context<SearchFieldPair | null>;
}
const cache = globalThis as unknown as GlobalCache;

/** SearchArea → SearchField 등록소. tsup entry 분리로 Context 가 겹치지 않게 globalThis 에 둔다. */
export const SearchDefaultsAreaContext: Context<SearchDefaultsAreaApi | null> =
  cache[GLOBAL_KEY] ?? (cache[GLOBAL_KEY] = createContext<SearchDefaultsAreaApi | null>(null));

export interface SearchFieldPair {
  role: "from" | "to";
  /** 상대 칸의 키(없으면 null). */
  partnerKey: string | null;
}

/** SearchArea 의 기간 짝(label="~") 묶음이 두 칸에 내려주는 짝 정보. */
export const SearchFieldPairContext: Context<SearchFieldPair | null> =
  cache[PAIR_GLOBAL_KEY] ?? (cache[PAIR_GLOBAL_KEY] = createContext<SearchFieldPair | null>(null));

export function useSearchDefaultsArea(): SearchDefaultsAreaApi | null {
  return useContext(SearchDefaultsAreaContext);
}

const isDev = () => process.env.NODE_ENV !== "production";

export interface UseSearchDefaultsControllerOptions {
  /** false 면 넣지 않는다(SearchArea `defaults`). */
  enabled: boolean;
  /** 한 화면에 SearchArea 가 둘 이상일 때 저장 키 접두(SearchArea `defaultsScope`). */
  scope?: string;
  /** 넣기가 끝난 뒤 onSearch 를 한 번 부른다(SearchArea `autoSearch`). */
  autoSearch: boolean;
  onSearch?: () => void;
  /** SearchArea 바깥 요소 — 대화 상자 안인지 본다. */
  rootRef: RefObject<HTMLElement | null>;
}

type Phase = "pending" | "done";

/** SearchArea 안에서 부른다. 컨텍스트로 내려줄 등록소를 돌려준다. */
export function useSearchDefaultsController(opts: UseSearchDefaultsControllerOptions): SearchDefaultsAreaApi {
  const { enabled, autoSearch, onSearch, rootRef } = opts;
  const scope = opts.scope ?? "";
  const { pageId } = useTabPage();
  const restored = useCarryRestored();

  const handlesRef = useRef(new Map<string, SearchDefaultsFieldHandle>());
  const phaseRef = useRef<Phase>("pending");
  /** 대화 상자 안 등 — 넣기·기록을 모두 하지 않는다(마운트 때 정한다). */
  const offRef = useRef(false);
  const appliedRef = useRef(new Set<string>());
  const userIdRef = useRef("");
  /**
   * 넣기 전(등록 때)의 칸 값. 저장소가 늦어 나중에 넣을 때, 그 사이 화면 effect(handoff)나 사용자가 바꾼 칸은 덮지 않는다(§6.3).
   * children 칸은 사용자 입력을 touched 로 알 수 없어 이 비교로 막는다.
   */
  const baselineRef = useRef(new Map<string, string>());
  /** 처음 등록 때 값(코드 기본값) — 초기화·의존 칸 비우기가 넣을 값이 없는 칸을 이 값으로 되돌린다. */
  const initialRef = useRef(new Map<string, string>());
  /** 지난 커밋의 칸 값 — 기준 칸이 바뀐 커밋을 알아낸다(의존 칸). */
  const lastSeenRef = useRef(new Map<string, string>());
  /** 선택지에 아직 없어 보류한 값(서버에서 받는 선택지) — 한도 안에 선택지가 생기고 칸이 그대로면 넣는다. */
  const awaitingRef = useRef(new Map<string, { value: string; until: number }>());
  /** 넣기가 끝난 뒤 처음 등록된 칸 — 같은 커밋의 layout effect 에서 한꺼번에 넣는다. */
  const lateRef = useRef(new Set<string>());
  const pendingCheckRef = useRef<Map<string, string> | null>(null);
  const pendingAutoSearchRef = useRef(false);
  /** 선택지 보류 때문에 미룬 autoSearch — 보류가 비거나 한도가 넘으면 예약한다. */
  const deferredSearchRef = useRef(false);
  const deferTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  /** 초기화 — 화면이 비운 값이 커밋된 다음 layout effect 에서 넣는다(같은 클릭 안에서는 아직 비우기 전 값이 보인다). */
  const pendingResetRef = useRef(false);
  /**
   * 렌더 번호. 넣기·autoSearch·초기화를 예약한 뒤의 렌더가 커밋됐을 때만 처리한다 — layout effect 에서 동기 재렌더를 예약하면
   * React 가 재렌더 전에 앞 커밋의 passive effect 를 먼저 돌리는데, 그때의 onSearch·값은 넣기 전 것이다(설계 §6.4).
   */
  const renderIdRef = useRef(0);
  renderIdRef.current += 1;
  const scheduledAtRef = useRef(0);
  const resetAtRef = useRef(0);
  const onSearchRef = useRef(onSearch);
  onSearchRef.current = onSearch;
  const optsRef = useRef({ enabled, autoSearch, pageId, scope, restored });
  optsRef.current = { enabled, autoSearch, pageId, scope, restored };
  const [tick, setTick] = useState(0);

  const storageKey = useCallback((fieldKey: string) => (scope ? `${scope}.${fieldKey}` : fieldKey), [scope]);

  /** 칸들에 규칙을 넣는다. 넣은 값은 다음 커밋에 확인한다. */
  const applyTo = useCallback(
    (handles: Array<[string, SearchDefaultsFieldHandle]>, mode: ApplyMode) => {
      const userId = userIdRef.current;
      const { pageId: pid } = optsRef.current;
      const useRules = !mode.rulesOff && !!userId && !!pid;
      if (!useRules && !mode.clearToInitial) return;
      const rules = useRules ? getPageSearchDefaults(userId, pid) : {};
      const last = useRules ? readSearchLastValues(userId, pid) : {};
      const now = new Date();
      const targets = new Map<string, string>();
      for (const [key, h] of handles) {
        // 판정한 칸은 넣지 않기로 했어도 「처리함」 — StrictMode 다시 등록 때 한 칸씩 다시 넣으면 기간 짝 검사를 건너뛴다.
        appliedRef.current.add(key);
        // 넣을 값이 없으면 코드 기본값으로 비운다(초기화·의존 칸).
        const initial = mode.clearToInitial ? initialRef.current.get(key) : undefined;
        const clear = () => {
          if (initial !== undefined) targets.set(key, initial);
        };
        const rule = rules[key];
        if (!rule || (mode.skipLast && rule.kind === "last")) {
          clear();
          continue;
        }
        if (!mode.ignoreTouched && h.touched) continue;
        if (mode.onlyIfUnchanged && baselineRef.current.has(key) && h.getValue() !== baselineRef.current.get(key)) continue;
        const optionValues = h.info.options?.map((o) => o.value);
        const ctx = { valueType: h.info.valueType, optionValues, lastValue: last[key], now };
        const v = resolveSearchDefault(rule, ctx);
        if (v !== undefined) {
          targets.set(key, v);
          awaitingRef.current.delete(key);
          continue;
        }
        clear();
        // 선택지가 아직 없어서 못 넣은 값은 보류한다(선택지를 서버에서 받는 칸).
        if (optionValues && !mode.noAwait) {
          const raw = resolveSearchDefault(rule, { ...ctx, optionValues: undefined });
          if (raw !== undefined) awaitingRef.current.set(key, { value: raw, until: Date.now() + SEARCH_DEFAULTS_OPTIONS_WAIT_MS });
        }
      }
      // 기간: From 이 To 보다 늦으면 두 칸 모두 넣지 않는다(설계 §4.4).
      for (const [key, h] of handles) {
        const pair = h.info.pair;
        if (pair?.role !== "from" || !pair.partnerKey) continue;
        const toKey = storageKey(pair.partnerKey);
        const from = targets.get(key) ?? h.getValue();
        const toHandle = handlesRef.current.get(toKey);
        const to = targets.get(toKey) ?? toHandle?.getValue() ?? "";
        if ((targets.has(key) || targets.has(toKey)) && from && to && from > to) {
          if (isDev()) console.warn(`[search-defaults] "${h.info.label}" 기간 기본값의 시작(${from})이 끝(${to})보다 늦어 넣지 않는다`);
          targets.delete(key);
          targets.delete(toKey);
        }
      }
      if (targets.size === 0) return;
      const check = pendingCheckRef.current ?? new Map<string, string>();
      for (const [key, v] of targets) {
        const h = handlesRef.current.get(key);
        if (!h) continue;
        appliedRef.current.add(key);
        if (h.getValue() !== v) h.setValue(v);
        check.set(key, v);
      }
      pendingCheckRef.current = check;
      scheduledAtRef.current = renderIdRef.current;
      setTick((n) => n + 1);
    },
    [storageKey],
  );

  /** autoSearch 를 예약한다 — 다음 커밋의 passive effect 가 부른다. */
  const scheduleAutoSearch = useCallback(() => {
    deferredSearchRef.current = false;
    if (deferTimerRef.current !== null) {
      clearTimeout(deferTimerRef.current);
      deferTimerRef.current = null;
    }
    pendingAutoSearchRef.current = true;
    scheduledAtRef.current = renderIdRef.current;
    setTick((n) => n + 1);
  }, []);

  /** 미룬 autoSearch 의 한도 — 넘으면 보류한 값을 버리고 지금 값으로 조회한다. */
  const armDeferTimer = useCallback(() => {
    deferTimerRef.current = setTimeout(() => {
      deferTimerRef.current = null;
      if (!deferredSearchRef.current) return;
      awaitingRef.current.clear();
      scheduleAutoSearch();
    }, SEARCH_DEFAULTS_WAIT_MS);
  }, [scheduleAutoSearch]);

  /** 넣기를 끝낸다. 이어받은 값으로 시작한 화면이 아니면 autoSearch 를 예약한다(선택지를 기다리는 값이 있으면 미룬다). */
  const finish = useCallback(() => {
    if (phaseRef.current === "done") return;
    phaseRef.current = "done";
    if (!optsRef.current.autoSearch || optsRef.current.restored) return;
    if (awaitingRef.current.size > 0) {
      deferredSearchRef.current = true;
      armDeferTimer();
      return;
    }
    scheduleAutoSearch();
  }, [armDeferTimer, scheduleAutoSearch]);

  const applyAll = useCallback(
    (mode: ApplyMode) => {
      applyTo([...handlesRef.current.entries()], mode);
    },
    [applyTo],
  );

  // 마운트 때 한 번 — 자식 칸의 등록(layout effect)이 끝난 같은 커밋에서 돈다.
  useIsomorphicLayoutEffect(() => {
    if (phaseRef.current !== "pending") return undefined;
    const { enabled: en, pageId: pid, restored: rs } = optsRef.current;
    const inDialog = !!rootRef.current?.closest?.('[role="dialog"]');
    offRef.current = inDialog;
    if (!en || !pid || rs || inDialog) {
      finish();
      return undefined;
    }

    let cancelled = false;
    const cleanups: Array<() => void> = [];
    const timer = setTimeout(() => {
      if (cancelled || phaseRef.current !== "pending") return;
      if (isDev()) console.warn("[search-defaults] 조회 기본값을 기다리다 시간이 넘어 넣지 않는다", pid);
      finish();
    }, SEARCH_DEFAULTS_WAIT_MS);
    cleanups.push(() => clearTimeout(timer));

    const startWithUser = (userId: string) => {
      if (cancelled || phaseRef.current !== "pending" || !userId) return;
      userIdRef.current = userId;
      preloadSearchDefaults(userId);
      const tryApply = () => {
        if (cancelled || phaseRef.current !== "pending") return;
        if (getSearchDefaultsStatus(userId) !== "ready") return;
        // 기다리는 사이 화면이 defaults={false} 로 바꿨으면(handoff 로 조건을 정한 화면) 넣지 않는다 —
        // handoff 가 코드 기본값과 같은 값(빈 값)으로 비우면 값만으로는 구별할 수 없다(§6.3).
        if (optsRef.current.enabled) applyAll({ skipLast: false, ignoreTouched: false, onlyIfUnchanged: true });
        finish();
      };
      tryApply();
      if (phaseRef.current === "pending") cleanups.push(subscribeSearchDefaults(tryApply));
    };

    const known = peekCurrentUser()?.id ?? "";
    if (known) {
      startWithUser(known);
    } else {
      cleanups.push(subscribeCurrentUser((u) => startWithUser(u?.id ?? "")));
      void getCurrentUser().then(
        (r) => {
          if (r.ok) startWithUser(r.user.id);
          // 사용자를 확인하지 못하면 기다리지 않고 끝낸다(넣을 값이 없다).
          else if (!cancelled) finish();
        },
        () => {
          if (!cancelled) finish();
        },
      );
    }
    return () => {
      // StrictMode 의 effect 두 번 실행 — 기다림만 거두고 phase 는 그대로 둔다(두 번째 실행이 다시 기다린다).
      cancelled = true;
      cleanups.forEach((c) => c());
    };
    // 마운트 1회 — 함수들은 안정적이고, phase 가 pending 이 아니면 다시 돌아도 바로 끝난다.
  }, [applyAll, finish, rootRef]);

  // 커밋마다: 의존 칸 다시 채우기, 초기화 넣기(화면이 비운 값이 커밋된 뒤), 보류한 선택지 값 넣기, 보류가 비면 미룬 autoSearch 예약.
  useIsomorphicLayoutEffect(() => {
    const rulesOn = optsRef.current.enabled && !offRef.current;
    // 의존 칸 — 기준 칸 값이 지난 커밋과 다르면 의존 칸을 비우고 다시 채운다(같은 커밋에 화면이 직접 바꾼 의존 칸은 둔다).
    const seen = lastSeenRef.current;
    const changed = new Set<string>();
    for (const [key, h] of handlesRef.current) {
      const prev = seen.get(key);
      const v = h.getValue();
      if (prev !== undefined && prev !== v) changed.add(key);
      seen.set(key, v);
    }
    for (const key of [...seen.keys()]) if (!handlesRef.current.has(key)) seen.delete(key);
    if (changed.size > 0 && phaseRef.current === "done" && !optsRef.current.restored) {
      const deps: Array<[string, SearchDefaultsFieldHandle]> = [];
      for (const [key, h] of handlesRef.current) {
        const base = h.info.dependsOn;
        if (base && changed.has(storageKey(base)) && !changed.has(key)) {
          h.touched = false;
          awaitingRef.current.delete(key);
          deps.push([key, h]);
        }
      }
      if (deps.length > 0) {
        if (!userIdRef.current) userIdRef.current = peekCurrentUser()?.id ?? "";
        applyTo(deps, { skipLast: false, ignoreTouched: true, onlyIfUnchanged: false, clearToInitial: true, noAwait: true, rulesOff: !rulesOn });
      }
    }
    // 기능이 꺼졌으면(handoff 로 defaults={false}) 보류한 선택지 값도 버린다.
    if (!rulesOn) {
      awaitingRef.current.clear();
      lateRef.current.clear();
      pendingResetRef.current = false;
      if (deferredSearchRef.current) scheduleAutoSearch();
      return;
    }
    if (pendingResetRef.current && renderIdRef.current > resetAtRef.current) {
      pendingResetRef.current = false;
      // 비우기는 화면 초기화(onClick)가 이미 했다 — 처음 등록 값으로 되돌리지 않는다(분리 창은 처음 값이 이어받은 값이라 화면의 초기값과 다르다).
      applyAll({ skipLast: true, ignoreTouched: true, onlyIfUnchanged: false });
    }
    if (lateRef.current.size > 0) {
      const late = [...lateRef.current]
        .map((k) => [k, handlesRef.current.get(k)] as const)
        .filter((e): e is readonly [string, SearchDefaultsFieldHandle] => !!e[1] && !appliedRef.current.has(e[0]));
      lateRef.current.clear();
      if (late.length > 0) applyTo(late.map(([k, h]) => [k, h]), { skipLast: false, ignoreTouched: false, onlyIfUnchanged: false });
    }
    if (awaitingRef.current.size > 0) {
      const nowMs = Date.now();
      const ready: Array<[string, SearchDefaultsFieldHandle]> = [];
      for (const [key, a] of awaitingRef.current) {
        const h = handlesRef.current.get(key);
        const baseline = baselineRef.current.get(key);
        if (!h || nowMs > a.until || h.touched || (baseline !== undefined && h.getValue() !== baseline)) {
          awaitingRef.current.delete(key);
          continue;
        }
        if (h.info.options?.some((o) => o.value === a.value)) ready.push([key, h]);
      }
      if (ready.length > 0) applyTo(ready, { skipLast: false, ignoreTouched: false, onlyIfUnchanged: true });
    }
    // 넣었거나(applyTo 가 보류에서 뺀다) 사용자가 고쳐 보류가 비었으면 미룬 조회를 예약한다 — 넣은 값이 커밋된 뒤에 부른다.
    if (deferredSearchRef.current && awaitingRef.current.size === 0) scheduleAutoSearch();
  });

  // 미룬 autoSearch 의 한도 타이머 — 언마운트 때 거둔다. StrictMode 의 effect 다시 실행 뒤에는 다시 건다.
  useEffect(() => {
    if (deferredSearchRef.current && deferTimerRef.current === null) armDeferTimer();
    return () => {
      if (deferTimerRef.current !== null) {
        clearTimeout(deferTimerRef.current);
        deferTimerRef.current = null;
      }
    };
  }, [armDeferTimer]);

  // 넣은 뒤 확인(개발 모드 경고)과 autoSearch 는 커밋 뒤에 한다 — 그 커밋의 onSearch 가 새 상태를 잡고 있다.
  useEffect(() => {
    // 예약한 렌더 그대로의 커밋이면(아직 새 상태로 다시 그리지 않음) 건너뛴다 — 다음 커밋의 effect 가 처리한다.
    if (renderIdRef.current <= scheduledAtRef.current) return;
    const check = pendingCheckRef.current;
    if (check) {
      pendingCheckRef.current = null;
      if (isDev()) {
        for (const [key, v] of check) {
          const h = handlesRef.current.get(key);
          if (h && h.getValue() !== v) {
            console.warn(
              `[search-defaults] "${h.info.label}" 에 기본값(${v})을 넣었는데 값이 ${h.getValue()} 이다 — 조회 칸 onChange 를 함수형 갱신(setFilters((p) => ({ ...p, k: v })))으로 쓰는지 확인한다`,
            );
          }
        }
      }
    }
    if (pendingAutoSearchRef.current) {
      pendingAutoSearchRef.current = false;
      onSearchRef.current?.();
    }
  }, [tick]);

  // 조회(emitSearch) → 마지막 조회값 기록 / 초기화(emitSearchReset) → 다음 커밋에 사용자 기본값 다시 넣기.
  useEffect(() => {
    if (!pageId) return undefined;
    const offSearch = subscribeSearch(pageId, () => {
      if (!optsRef.current.enabled || offRef.current) return;
      // 지금 사용자 키로 적는다(같은 화면이 열린 채 사용자가 바뀌었어도 이전 사용자 키에 적지 않게).
      const userId = peekCurrentUser()?.id || userIdRef.current;
      if (!userId) return;
      const values: Record<string, string> = {};
      for (const [key, h] of handlesRef.current) values[key] = h.getValue();
      writeSearchLastValues(userId, pageId, values);
    });
    const offReset = subscribeSearchReset(pageId, () => {
      if (!optsRef.current.enabled || offRef.current) return;
      userIdRef.current = peekCurrentUser()?.id || userIdRef.current;
      for (const h of handlesRef.current.values()) h.touched = false;
      pendingResetRef.current = true;
      resetAtRef.current = renderIdRef.current;
      setTick((n) => n + 1);
    });
    return () => {
      offSearch();
      offReset();
    };
  }, [pageId]);

  return useMemo<SearchDefaultsAreaApi>(
    () => ({
      register(handle) {
        const key = storageKey(handle.info.fieldKey);
        const map = handlesRef.current;
        if (map.has(key) && map.get(key) !== handle) {
          if (isDev()) {
            console.warn(`[search-defaults] 같은 칸 키 "${key}" 가 두 번 등록됐다 — 나중 칸("${handle.info.label}")은 기본값 대상에서 뺀다`);
          }
          return () => {};
        }
        map.set(key, handle);
        // 분리 창이 이어받은 값으로 시작했으면 그 값은 코드 기본값이 아니므로 적지 않는다(의존 칸을 비우지 못하고 그대로 둔다).
        if (!initialRef.current.has(key) && !optsRef.current.restored) initialRef.current.set(key, handle.getValue());
        // 넣기 전이면 지금 값을 기준값으로 적어 둔다(늦게 넣을 때 그 사이 바뀐 칸은 덮지 않는다).
        if (phaseRef.current === "pending") baselineRef.current.set(key, handle.getValue());
        // 넣기가 끝난 뒤 처음 등록된 칸(조건부 칸)은 모아 두었다가 같은 커밋의 layout effect 에서 한꺼번에 넣는다 —
        // 함께 나타난 기간 짝을 같이 검사하려고(칸마다 넣으면 상대 칸이 아직 없어 시작>끝 검사를 건너뛴다).
        else if (!appliedRef.current.has(key) && optsRef.current.enabled && !offRef.current && !optsRef.current.restored) {
          lateRef.current.add(key);
        }
        return () => {
          if (map.get(key) === handle) map.delete(key);
        };
      },
      listFields() {
        return [...handlesRef.current.entries()].map(([storageKey, h]) => ({ ...h.info, storageKey }));
      },
      readValues() {
        const out: Record<string, string> = {};
        for (const [key, h] of handlesRef.current) out[key] = h.getValue();
        return out;
      },
      applyNow() {
        if (!optsRef.current.enabled || offRef.current) return;
        if (!userIdRef.current) userIdRef.current = peekCurrentUser()?.id ?? "";
        applyAll({ skipLast: false, ignoreTouched: true, onlyIfUnchanged: false });
      },
      isDisabled() {
        return !optsRef.current.enabled || offRef.current || !optsRef.current.pageId;
      },
      pageId,
      scope,
    }),
    [storageKey, applyTo, applyAll, pageId, scope],
  );
}
