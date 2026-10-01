"use client";

/**
 * 노드 찾기 위젯(2026-10-01, VS Code·Monaco 찾기 위젯 방식) — 캔버스 감싸개(`rsf-canvas-host`) 안 오른쪽 위에 떠 있는 작은 상자.
 * 왼쪽부터 입력 칸(`flow-find`, 칸 안쪽 오른쪽에 옵션 토글 셋 — 대소문자 구분 Aa·단어 단위 ab·정규식 .*, `aria-pressed`) · 건수(`flow-find-count`,
 * "2/5", 결과가 없으면 "결과 없음", 글자가 비면 빈 글) · [이전](`flow-find-prev`, Shift+Enter) · [다음](`flow-find-next`, Enter) · [닫기](`flow-find-close`, Esc).
 * 바꾸기 펼침·선택 영역 안에서 찾기는 두지 않는다.
 *
 * - 열기: page 가 Ctrl/Cmd+F(캔버스 감싸개의 단축키 디스패처)·툴바 [노드 찾기](`flow-find-open`)로 열고 `focusSeq` 를 올린다 — 올라갈 때마다(처음 열 때 포함)
 *   입력 칸에 초점을 두고 글을 전체 선택한다. 위젯 안에서 누른 Ctrl/Cmd+F 도 여기서 받아 입력 칸을 다시 선택한다(브라우저 찾기는 막는다).
 * - Enter = 다음, Shift+Enter = 이전. 한글 조합 중(isComposing)이면 무시한다.
 * - Esc: 위젯 안에 초점이 있을 때만 위젯 루트의 캡처 단계에서 받아 닫는다(page 가 초점을 캔버스로 먼저 돌린 뒤 닫는다 — 입력 칸이 사라지며 초점이 body 로 빠지지 않게).
 *   단축키 도움말이 열려 있으면 도움말의 문서 캡처 리스너가 먼저 받아 멈추므로 Esc 한 번은 하나만 닫는다. 캔버스에 초점이 있을 때의 Esc 는 예전처럼 선택 해제다.
 * - 위젯 안의 키는 캔버스 디스패처로 올려 보내지 않는다(초점이 위젯 단추에 있을 때 Delete 가 노드를 지우지 않게).
 * - 단추는 마우스로 눌러도 초점을 가져가지 않는다(`keepFocusOffButtons` — 초점이 입력 칸에 남는다, Local-Rules §19).
 * - 닫아도 글자·옵션은 `useFind`(page)에 남아 다시 열면 그대로 보인다.
 * - 잘못된 정규식이면 입력 칸에 공용 오류 테두리(`form-error`)와 `aria-invalid` 를 주고 결과는 0건이다(공용 Input 의 `error` 는 칸 아래 문구 줄을 그려 쓰지 않는다).
 * 옵션 토글은 입력 칸 안에 겹쳐 그리는 작은 글자 단추라 공용 Button(테두리·높이가 정해진 Mantine 단추)이 맞지 않아 도구 상자(`FlowToolbox`)처럼 원시 단추로 둔다.
 * 툴팁은 툴바와 같은 `span.rsf-tip[data-tip]`(styles/toolbox.ts)이고 `title` 은 두지 않는다.
 */
import { useEffect, type KeyboardEvent, type RefObject } from "react";

import { IconArrowDown, IconArrowUp, IconX } from "@tabler/icons-react";

import { Input } from "@dk-oasis/shared/form";

import type { FindOptions, FindState } from "../state/useFind";
import { keepFocusOffButtons } from "./FlowToolbar";
import { ToolButton } from "./ToolButton";

/** 옵션 토글 — 순서는 VS Code 와 같다. */
const OPTIONS: { key: keyof FindOptions; testId: string; label: string; glyph: string }[] = [
  { key: "caseSensitive", testId: "flow-find-case", label: "대소문자 구분", glyph: "Aa" },
  { key: "wholeWord", testId: "flow-find-word", label: "단어 단위로", glyph: "ab" },
  { key: "regex", testId: "flow-find-regex", label: "정규식 사용", glyph: ".*" },
];

export const FIND_NO_RESULT = "결과 없음";

/** 건수 글 — 글자가 비면 빈 글, 결과가 없으면 "결과 없음", 있으면 "2/5". */
export function findCountText(find: Pick<FindState, "query" | "hits" | "index">): string {
  if (find.query.trim() === "") return "";
  return find.hits.length === 0 ? FIND_NO_RESULT : `${find.index + 1}/${find.hits.length}`;
}

export interface FindWidgetProps {
  find: FindState;
  inputRef: RefObject<HTMLInputElement | null>;
  /** 올라갈 때마다 입력 칸에 초점을 두고 전체 선택한다(처음 그릴 때 포함). */
  focusSeq: number;
  /** Esc·[닫기] — page 가 초점을 캔버스로 돌리고 위젯을 닫는다. */
  onClose(): void;
  /** Mac 이면 Cmd+F, 아니면 Ctrl+F(디스패처와 같은 판정). */
  mac: boolean;
}

export function FindWidget({ find, inputRef, focusSeq, onClose, mac }: FindWidgetProps) {
  useEffect(() => {
    const el = inputRef.current;
    el?.focus({ preventScroll: true });
    el?.select();
  }, [focusSeq, inputRef]);

  const onKeyDownCapture = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== "Escape" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };
  const onKeyDown = (e: KeyboardEvent<HTMLDivElement>) => {
    const mod = mac ? e.metaKey && !e.ctrlKey : e.ctrlKey && !e.metaKey;
    if (mod && !e.shiftKey && !e.altKey && e.key.toLowerCase() === "f") {
      e.preventDefault();
      inputRef.current?.focus({ preventScroll: true });
      inputRef.current?.select();
    }
    // 위젯 안의 키는 캔버스 단축키 디스패처(감싸개 onKeyDown)로 보내지 않는다.
    e.stopPropagation();
  };
  const onInputKeyDown = (e: KeyboardEvent<HTMLInputElement>) => {
    if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
    e.preventDefault();
    if (e.shiftKey) find.prev();
    else find.next();
  };

  const none = find.hits.length === 0;
  return (
    <div
      data-testid="flow-find-widget"
      className="rsf-find-widget"
      role="search"
      aria-label="노드 찾기"
      onMouseDown={keepFocusOffButtons}
      onKeyDownCapture={onKeyDownCapture}
      onKeyDown={onKeyDown}
    >
      <div className="rsf-find-field">
        <Input
          data-testid="flow-find"
          {...({ ref: inputRef } as object)}
          className={find.invalid ? "rsf-find-input form-error" : "rsf-find-input"}
          aria-invalid={find.invalid}
          placeholder="찾기"
          aria-label="노드 찾기 — 룰 ID·이름·라벨"
          value={find.query}
          onChange={find.setQuery}
          onKeyDown={onInputKeyDown}
        />
        <span className="rsf-find-opts">
          {OPTIONS.map((o) => (
            <span key={o.key} className="rsf-tip" data-tip={o.label}>
              <button
                type="button"
                data-testid={o.testId}
                data-opt={o.key}
                className="rsf-find-opt"
                aria-label={o.label}
                aria-pressed={find.options[o.key]}
                onClick={() => find.toggleOption(o.key)}
              >
                <span aria-hidden="true">{o.glyph}</span>
              </button>
            </span>
          ))}
        </span>
      </div>
      <span data-testid="flow-find-count" className="rsf-find-count" data-empty={none ? "" : undefined} aria-live="polite">
        {findCountText(find)}
      </span>
      <ToolButton
        data-testid="flow-find-prev"
        label="이전 결과"
        align="end"
        tip="이전 결과 (Shift+Enter)"
        icon={<IconArrowUp size={14} aria-hidden="true" />}
        disabled={none}
        onClick={find.prev}
      />
      <ToolButton
        data-testid="flow-find-next"
        label="다음 결과"
        align="end"
        tip="다음 결과 (Enter)"
        icon={<IconArrowDown size={14} aria-hidden="true" />}
        disabled={none}
        onClick={find.next}
      />
      <ToolButton data-testid="flow-find-close" label="닫기" tip="닫기 (Esc)" align="end" icon={<IconX size={14} aria-hidden="true" />} onClick={onClose} />
    </div>
  );
}
