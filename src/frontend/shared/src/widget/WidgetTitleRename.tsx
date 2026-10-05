"use client";

/**
 * 위젯 틀 제목 줄의 이름 바꾸기 입력칸(틀 안에서만 쓰는 내부 부품 — shared 공개 API 가 아니다).
 * Enter 로 저장, Esc 로 취소, 칸을 벗어나면(blur) 저장한다. 탭 이름 바꾸기(WidgetTabs RenameInput)와 같은 규칙이되 저장이 비동기다:
 * - 저장 중에는 입력칸을 잠그고 같은 이름을 두 번 보내지 않는다(Enter 연타·blur 겹침).
 * - 저장이 실패하면 입력칸을 닫지 않고 오류 문장을 알린다. 오류가 남아 있는 동안 칸을 벗어나도 다시 보내지 않는다(Enter 로만 다시 시도).
 * - 한글 조합 중 Enter 는 글자 확정이므로 저장하지 않는다.
 * - 이름은 WIDGET_TITLE_MAX(40) 코드 포인트까지만 담긴다. 앞 공백은 저장 때 잘리므로 세지 않고, 제어 문자는 공백으로 바꾼다.
 */
import { useEffect, useRef, useState } from "react";

import { WIDGET_TITLE_MAX } from "./constants";

const CONTROL_ALL = /[\u0000-\u001F\u007F-\u009F]/g;

/** 입력을 정리한다 — 제어 문자는 공백으로, 앞 공백을 뺀 길이가 한도를 넘으면 코드 포인트 단위로 자른다. */
export function clampWidgetTitle(raw: string): string {
  const cleaned = raw.replace(CONTROL_ALL, " ");
  const lead = cleaned.length - cleaned.trimStart().length;
  const points = Array.from(cleaned);
  const limit = lead + WIDGET_TITLE_MAX;
  return points.length > limit ? points.slice(0, limit).join("") : cleaned;
}

export const WIDGET_RENAME_FAILED = "이름을 바꾸지 못했습니다. 잠시 뒤 다시 시도하세요.";

export interface WidgetTitleRenameProps {
  /** 지금 보이는 제목 — 입력칸의 처음 값이다. 바뀌지 않은 채 확정하면 저장하지 않고 닫는다. */
  initial: string;
  /** 앞뒤 공백을 자른 새 이름을 저장한다. 실패하면 사용자에게 보일 문장을 담은 Error 를 던진다. */
  onCommit: (title: string) => Promise<void>;
  /** 입력칸을 닫는다. restoreFocus: 키보드(Enter·Esc)로 닫았으니 틀이 포커스를 연필 버튼으로 돌려준다(칸을 벗어나 닫을 때는 아님). */
  onClose: (restoreFocus: boolean) => void;
}

export function WidgetTitleRename({ initial, onCommit, onClose }: WidgetTitleRenameProps) {
  const [value, setValue] = useState(initial);
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const ref = useRef<HTMLInputElement>(null);
  /** 저장이 진행 중이거나 이미 끝났다(취소·성공) — 입력칸이 사라지며 나는 blur 가 다시 확정하지 않게 한다. */
  const doneRef = useRef(false);
  const aliveRef = useRef(true);

  useEffect(() => {
    aliveRef.current = true;
    ref.current?.focus();
    ref.current?.select();
    return () => {
      aliveRef.current = false;
    };
  }, []);

  const commit = async (restoreFocus: boolean) => {
    if (doneRef.current) return;
    const next = value.trim();
    if (next === initial.trim()) {
      doneRef.current = true;
      onClose(restoreFocus);
      return;
    }
    doneRef.current = true;
    setBusy(true);
    setError(null);
    try {
      await onCommit(next);
      if (aliveRef.current) onClose(restoreFocus);
    } catch (e) {
      if (!aliveRef.current) return;
      doneRef.current = false;
      setBusy(false);
      setError(e instanceof Error && e.message ? e.message : WIDGET_RENAME_FAILED);
      // 잠겼던 입력칸이 풀린 뒤 다시 고칠 수 있게 포커스를 돌려준다.
      window.setTimeout(() => ref.current?.focus(), 0);
    }
  };

  return (
    <>
      <input
        ref={ref}
        className="cm-widget__rename"
        value={value}
        readOnly={busy}
        aria-label="위젯 이름"
        aria-invalid={error ? true : undefined}
        data-testid="widget-rename-input"
        onChange={(e) => {
          setValue(clampWidgetTitle(e.target.value));
          setError(null);
        }}
        onClick={(e) => e.stopPropagation()}
        onKeyDown={(e) => {
          if (e.nativeEvent.isComposing || e.keyCode === 229) return;
          if (e.key === "Enter") {
            e.preventDefault();
            void commit(true);
          } else if (e.key === "Escape") {
            e.preventDefault();
            e.stopPropagation();
            if (doneRef.current) return;
            doneRef.current = true;
            onClose(true);
          }
        }}
        onBlur={() => {
          if (error) return;
          void commit(false);
        }}
      />
      {error && (
        <span className="cm-widget__rename-error" role="alert">
          {error}
        </span>
      )}
    </>
  );
}
