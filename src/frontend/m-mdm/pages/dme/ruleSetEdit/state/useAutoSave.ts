"use client";

/**
 * 룰 세트 편집 자동 저장(켜고 끄기). 툴바 [자동 저장] 이 켜고 끄며, 값은 보는 사람 설정(`storeKeys.autoSave`, 기본 꺼짐)으로 기억한다.
 * 저장소가 없거나 던져도 기본값으로 동작한다(`local-store`).
 *
 * 언제 저장하나: 켜져 있고, 수동 [세트 저장] 이 켜질 조건(편집 모드·편집 권한(`active`)·dirty·조건식 IO 기다리지 않음·
 * 로딩 아님. 거부 검사가 있어도 저장한다)에 충돌 아님·진행 중인 자동 저장 없음을 더해 모두 만족하면, 마지막 변경(흐름·세트명·설명) 뒤 `AUTO_SAVE_DELAY_MS` 동안
 * 변경이 없을 때 `saveQuiet` 로 저장한다(디바운스). 저장 중에 생긴 변경은 그 저장이 끝난 뒤 다시 디바운스한다. 켤 때 이미 dirty 면
 * 같은 규칙으로 곧 저장한다.
 *
 * 실패: 행 버전 충돌이면 이 화면에서 자동 저장을 끄고(보는 사람 설정은 그대로 둔다) 기존 충돌 안내·다시 불러오기에 맡긴다.
 * 그 버전이 더 이상 내 DRAFT 가 아니면(`stale`, MDM002·MDM003 — D-144 2단계) 충돌처럼 이 화면에서 끈다. 편집 상태가 이미 읽기 전용으로 다시 불러왔다.
 * 다른 오류는 메시지 줄에 보이고, 그 내용(`contentKey`)이 바뀔 때까지 다시 시도하지 않는다. 껐다 켜도 다시 시도한다.
 * 보낸 내용과 지금 내용이 같은데도 dirty 가 남으면(기준점 계산이 어긋난 경우) 같은 내용을 다시 보내지 않는다 — 2초마다 저장하는 고리를 막는다.
 *
 * 상태 글(2026-10-01): 알아야 할 것(실패)만 보인다. "저장 중"·"자동 저장됨 HH:MM:SS" 같은 정보 글은 두지 않고,
 * 마지막 자동 저장 시각(`savedAt`)을 [자동 저장] 단추 툴팁이 보인다. 상태 글은 툴바 줄이 아니라 툴바 아래 메시지 줄에 그린다
 * (길이가 바뀌는 글이 툴바 줄에 있으면 단추 위치가 흔들린다, 2026-10-06).
 * 검사(WARN·REJECT)는 저장을 막지 않고 툴바에도 보이지 않는다 — 아래 검사 결과에만 있다(2026-10-02 사용자 요청).
 * 거부(REJECT) 검사가 있어도 DRAFT 는 저장한다. 확정·되살리기만 거부로 막는다(2026-10-06 사용자 결정).
 */
import { useCallback, useEffect, useRef, useState } from "react";

import { loadFlag, saveFlag, storeKeys } from "../debugger/local-store";
import type { RuleSetEditState } from "./useRuleSetEdit";

/** 마지막 변경 뒤 자동 저장까지 기다리는 시간(ms). */
export const AUTO_SAVE_DELAY_MS = 2000;

/** 툴바 아래 메시지 줄의 자동 저장 상태 글 — 실패만. */
export interface AutoSaveStatus {
  kind: "error";
  text: string;
  title?: string;
}

export interface AutoSave {
  enabled: boolean;
  /** 켜고 끈다(보는 사람 설정에 기억한다). */
  setEnabled(on: boolean): void;
  /** 상태 글 — 꺼져 있거나 보일 것이 없으면 null. */
  status: AutoSaveStatus | null;
  /** 마지막 자동 저장 시각("HH:MM:SS") — 단추 툴팁용. 없으면 null. */
  savedAt: string | null;
}

const two = (n: number) => String(n).padStart(2, "0");
const clock = (d: Date) => `${two(d.getHours())}:${two(d.getMinutes())}:${two(d.getSeconds())}`;

/**
 * @param state 편집 상태(`useRuleSetEdit`)
 * @param active 편집 모드이고 편집할 수 있는가(page 의 `editing` — 선택 버전이 내 DRAFT·폐기 아님·저장 권한을 이미 따졌다)
 */
export function useAutoSave(state: RuleSetEditState, active: boolean): AutoSave {
  const [enabled, setEnabledState] = useState(() => loadFlag(storeKeys.autoSave, false));
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  /** 실패한 내용의 키 — 내용이 바뀌기 전까지 다시 보내지 않는다. */
  const [failedKey, setFailedKey] = useState<string | null>(null);
  /** 마지막으로 보내 성공한 내용의 키 — dirty 가 남아도 같은 내용은 다시 보내지 않는다. */
  const [sentKey, setSentKey] = useState<string | null>(null);

  const { dirty, contentKey: key, condIoPending, loading, conflict, autoSaving, viewEpoch, saveQuiet } = state;

  // 다른 세트를 열거나 [다시 불러오기] 하면 지난 결과를 버린다.
  useEffect(() => {
    setSavedAt(null);
    setFailedKey(null);
    setSentKey(null);
  }, [viewEpoch]);
  // 변경이 없으면 보낸 내용 기억은 필요 없다(뒤에 같은 내용으로 돌아와 dirty 가 되면 다시 보내야 한다).
  useEffect(() => {
    if (!dirty) setSentKey(null);
  }, [dirty]);

  const mounted = useRef(true);
  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const ready =
    enabled && active && dirty && !condIoPending && !loading && !conflict && !autoSaving && key !== failedKey && key !== sentKey;

  // 디바운스 — 내용(key)이 바뀌거나 조건이 다시 맞으면 타이머를 새로 건다.
  useEffect(() => {
    if (!ready) return;
    const t = setTimeout(() => {
      void saveQuiet().then((r) => {
        if (!mounted.current) return;
        if (r.status === "saved") {
          setSentKey(r.key);
          setFailedKey(null);
          setSavedAt(new Date());
        } else if (r.status === "conflict" || r.status === "stale") {
          setFailedKey(r.key);
          setEnabledState(false);
        } else if (r.status === "error") {
          setFailedKey(r.key);
        }
      });
    }, AUTO_SAVE_DELAY_MS);
    return () => clearTimeout(t);
  }, [ready, key, saveQuiet]);

  const setEnabled = useCallback((on: boolean) => {
    setEnabledState(on);
    saveFlag(storeKeys.autoSave, on);
    if (on) setFailedKey(null);
  }, []);

  let status: AutoSaveStatus | null = null;
  if (enabled && !autoSaving && dirty && key === failedKey) status = { kind: "error", text: "자동 저장 실패. 고치면 다시 저장한다" };

  return { enabled, setEnabled, status, savedAt: savedAt ? clock(savedAt) : null };
}
