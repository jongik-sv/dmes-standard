"use client";

/**
 * 툴바 아이콘 단추(룰 세트 편집기 canvas/ToolButton.tsx 복사본). 글자 없이 아이콘만 보이고, 이름은 aria-label(= label),
 * 설명은 단추를 감싼 `span.${접두}-tip[data-tip]` 의 CSS 툴팁이다. title 은 두지 않는다(브라우저 툴팁과 겹침 방지).
 * 크기는 26×26 정사각형 — 공용 Button 의 size 를 바꾸지 않고 `${접두}-tool-btn` 규칙으로 고정한다.
 */
import type { MouseEvent, ReactNode } from "react";

import { Button, type ButtonProps } from "../form/Button";
import { DEFAULT_CLASS_PREFIX, styleHref, toolCss } from "./styles";

/** 단추 위 mousedown 의 기본 동작(초점 옮기기)을 막는다. 누르기(click)는 그대로 온다(Local-Rules §19). */
export function keepFocusOffButtons(e: MouseEvent<HTMLElement>): void {
  if ((e.target as Element | null)?.closest?.("button")) e.preventDefault();
}

export interface ToolButtonProps extends Omit<ButtonProps, "children" | "ariaLabel" | "title"> {
  /** 접근성 이름(aria-label). */
  label: string;
  icon: ReactNode;
  /** 툴팁 글. 없으면 label. */
  tip?: string;
  /** "end" 는 툴팁 오른쪽 끝을 단추 오른쪽 끝에 맞춘다(툴바 오른쪽 끝 단추). */
  align?: "center" | "end";
  /** 툴팁을 숨긴다. */
  tipOff?: boolean;
  /** 클래스 접두(기본 "rfx"). */
  classPrefix?: string;
}

export function ToolButton({ label, icon, tip, align = "center", tipOff, className, classPrefix = DEFAULT_CLASS_PREFIX, ...rest }: ToolButtonProps) {
  const p = classPrefix;
  return (
    <span className={`${p}-tip`} data-tip={tip ?? label} data-tip-align={align === "end" ? "end" : undefined} data-tip-off={tipOff ? "" : undefined}>
      <style href={styleHref("tool", p)} precedence="default">
        {toolCss(p)}
      </style>
      <Button ariaLabel={label} className={className ? `${p}-tool-btn ${className}` : `${p}-tool-btn`} {...rest}>
        {icon}
      </Button>
    </span>
  );
}
