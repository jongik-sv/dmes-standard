"use client";

/**
 * 단위 계산기 렌더러 상태 + 브라우저 기억(localStorage) 읽기·쓰기.
 * - 키는 `dmes:widget:unit-converter:{userId}:{instanceId}` — 사용자를 모르면 기억하지 않는다(읽지도 쓰지도 않음).
 * - 읽기: 첫 렌더는 이 세션에서 확인된 사용자(peek)로 읽는다. 확인된 사용자가 그와 다르면 그 사용자의 기억으로 다시 읽는다
 *   (사용자가 아직 아무것도 고치지 않았을 때만 — 읽은 사용자가 없던 상태에서 이미 고친 값은 그대로 둔다).
 * - 쓰기: 사용자가 값을 바꿨을 때만(마운트·다시 읽기로는 쓰지 않는다), 확인된 사용자의 키로, 300ms 디바운스한다.
 *   위젯이 사라질 때(탭 전환·다시 그리기) 아직 안 쓴 값은 바로 쓴다.
 */
import { useCallback, useEffect, useRef, useState, type SetStateAction } from "react";

import { initialState, isRememberable, storageKey, type UnitConfig, type UnitState } from "./unit-model";
import { readRemembered, writeRemembered } from "./unit-storage";
import { peekUserId, useConfirmedUserId } from "./unit-user";

export const SAVE_DELAY_MS = 300;

interface Held {
  /** 이 상태를 읽어 온 사용자("" = 읽은 기억 없음). */
  user: string;
  /** 사용자가 마지막으로 읽거나 쓴 뒤 값을 바꿨다 — 쓸 값이 있다. */
  dirty: boolean;
  state: UnitState;
}

export function useUnitState(
  cfg: UnitConfig,
  widgetId: string | undefined,
  instanceId: string | undefined
): [UnitState, (updater: SetStateAction<UnitState>) => void] {
  const canRemember = isRememberable(widgetId, instanceId);
  const confirmedId = useConfirmedUserId(canRemember);
  const [held, setHeld] = useState<Held>(() => {
    const user = canRemember ? peekUserId() : "";
    return { user, dirty: false, state: initialState(cfg, readRemembered(storageKey(widgetId, instanceId, user))) };
  });
  const key = storageKey(widgetId, instanceId, confirmedId);
  const latest = useRef<{ key: string | null; held: Held }>({ key: null, held });

  // 확인된 사용자가 읽은 사용자와 다르면 그 사용자의 기억으로 다시 읽는다(렌더 중 상태 맞춤 — 효과에서 setState 하지 않는다).
  if (confirmedId && confirmedId !== held.user) {
    if (held.user === "" && held.dirty) setHeld({ ...held, user: confirmedId });
    else setHeld({ user: confirmedId, dirty: false, state: initialState(cfg, readRemembered(key)) });
  }

  useEffect(() => {
    latest.current = { key, held };
  });

  useEffect(() => {
    if (!key || !held.dirty) return;
    const written = held.state;
    const timer = setTimeout(() => {
      writeRemembered(key, written);
      setHeld((h) => (h.state === written ? { ...h, dirty: false } : h));
    }, SAVE_DELAY_MS);
    return () => clearTimeout(timer);
  }, [key, held]);

  useEffect(
    () => () => {
      const { key: lastKey, held: lastHeld } = latest.current;
      if (lastKey && lastHeld.dirty) writeRemembered(lastKey, lastHeld.state);
    },
    []
  );

  const update = useCallback((updater: SetStateAction<UnitState>) => {
    setHeld((h) => ({ ...h, dirty: true, state: typeof updater === "function" ? updater(h.state) : updater }));
  }, []);

  return [held.state, update];
}
