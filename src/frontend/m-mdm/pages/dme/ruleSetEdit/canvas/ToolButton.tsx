"use client";

/**
 * 툴바 아이콘 단추 — 흐름 툴바(`FlowToolbar`)·디버그 툴바(`DebugToolbar`)가 함께 쓴다.
 * 글자 없이 아이콘만 보이고, 이름은 `aria-label`(= label), 설명은 단추를 감싼 `span.rsf-tip[data-tip]` 의 즉시 CSS 툴팁(`styles/toolbox.ts`)으로 보인다.
 * `title` 은 두지 않는다(브라우저 툴팁과 겹침 방지). tip 을 주지 않으면 label 을 툴팁으로 쓴다.
 * align="end" 는 툴팁을 단추 오른쪽 끝에 맞춘다 — 툴바 오른쪽 끝 단추의 긴 툴팁이 화면 밖으로 나가지 않게 한다.
 */
import type { ReactNode } from "react";

import { Button, type ButtonProps } from "@dk-oasis/shared/form";

export interface ToolButtonProps extends Omit<ButtonProps, "children" | "ariaLabel" | "title"> {
  /** 접근성 이름(aria-label). */
  label: string;
  icon: ReactNode;
  /** 툴팁 글. 없으면 label. */
  tip?: string;
  align?: "center" | "end";
  /** 툴팁을 숨긴다(예: 도움말이 열려 있을 때). */
  tipOff?: boolean;
}

export function ToolButton({ label, icon, tip, align = "center", tipOff, ...rest }: ToolButtonProps) {
  return (
    <span className="rsf-tip" data-tip={tip ?? label} data-tip-align={align === "end" ? "end" : undefined} data-tip-off={tipOff ? "" : undefined}>
      <Button ariaLabel={label} {...rest}>
        {icon}
      </Button>
    </span>
  );
}
