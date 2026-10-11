"use client";

/**
 * 툴바 글자 단추 — 아이콘 단추(ToolButton)와 달리 글자가 보이고 공용 Button(size sm)을 쓴다. 눌림(토글) 도구는 primary 색이다.
 * 켜진 단추는 title 에 "할 일 (단축키)" 를 달아 단축키를 알린다.
 * 꺼지면 감싼 span 의 title 로 이유를 보이고(꺼진 단추는 마우스 이벤트를 받지 않는다), 보이지 않는 글 + aria-describedby 로
 * 보조기기에도 읽힌다(꺼진 단추는 초점을 못 받는다).
 * 토글 도구는 aria-pressed, 메뉴를 여는 단추(menu)는 aria-haspopup="menu" + aria-expanded 를 단다.
 */
import { useId, type CSSProperties, type MouseEvent } from "react";

import { Button } from "../form/Button";

/** 화면에는 안 보이고 보조기기에는 읽히는 글(sr-only). */
const VISUALLY_HIDDEN: CSSProperties = {
  position: "absolute", width: 1, height: 1, margin: -1, padding: 0, overflow: "hidden", clip: "rect(0 0 0 0)", whiteSpace: "nowrap", border: 0,
};

export interface TextToolButtonProps {
  /** 단추에 보이는 글(= 접근성 이름). */
  label: string;
  /** 툴팁 글. 켜졌을 때는 단추 title, 꺼졌을 때는 감싼 span title + 보이지 않는 이유 글. 없으면 label. */
  tip?: string;
  /** 꺼짐. */
  disabled?: boolean;
  /** 눌림(토글 도구가 켜진 상태). primary 색이 된다. menu 이면 색만 바꾸고 aria-pressed 는 달지 않는다. */
  pressed?: boolean;
  /** 메뉴를 여는 단추 — aria-haspopup="menu" 와 aria-expanded 를 단다. */
  menu?: boolean;
  /** menu 일 때 메뉴가 열려 있는지(aria-expanded). */
  open?: boolean;
  onClick?(e: MouseEvent<HTMLButtonElement>): void;
  /** 단추의 data-testid. 꺼진 이유 글은 `${testId}-reason`. */
  testId?: string;
  /** 감싼 span 에 붙일 클래스. */
  className?: string;
}

export function TextToolButton({ label, tip, disabled = false, pressed, menu, open, onClick, testId, className }: TextToolButtonProps) {
  const reasonId = useId();
  const text = tip ?? label;
  return (
    <span className={className} title={disabled ? text : undefined}>
      <Button size="sm" variant={pressed ? "primary" : "default"} disabled={disabled} data-testid={testId} onClick={onClick}
        title={disabled ? undefined : text} aria-describedby={disabled ? reasonId : undefined}
        aria-pressed={menu ? undefined : pressed} aria-haspopup={menu ? "menu" : undefined} aria-expanded={menu ? open : undefined}>
        {label}
      </Button>
      {disabled && <span id={reasonId} style={VISUALLY_HIDDEN} data-testid={testId ? `${testId}-reason` : undefined}>{text}</span>}
    </span>
  );
}
