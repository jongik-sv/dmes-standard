"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { Button } from "@mantine/core";

/**
 * 문자열을 클립보드에 복사한다. 보안 컨텍스트(https·localhost)가 아니면 navigator.clipboard 가 없으므로
 * 숨긴 textarea + execCommand("copy") 로 대신한다. 성공 여부를 돌려준다.
 */
export async function copyText(text: string): Promise<boolean> {
  try {
    if (typeof navigator !== "undefined" && navigator.clipboard && window.isSecureContext) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // 권한 거부 등 — 아래 대체 경로로 간다.
  }
  try {
    const ta = document.createElement("textarea");
    ta.value = text;
    ta.setAttribute("readonly", "");
    ta.style.position = "fixed";
    ta.style.top = "-1000px";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    const ok = document.execCommand("copy");
    document.body.removeChild(ta);
    return ok;
  } catch {
    return false;
  }
}

export interface CopyTextButtonProps {
  /** 복사할 문자열. 함수면 누를 때 계산한다. */
  text: string | (() => string);
  label?: string;
  className?: string;
  style?: CSSProperties;
}

/** 오류 메시지 등을 복사하는 작은 버튼. 누르면 잠시 "복사됨"/"복사 실패" 로 바뀐다. */
export function CopyTextButton({ text, label = "복사", className = "cm-btn cm-btn-outline", style }: CopyTextButtonProps) {
  const [state, setState] = useState<"idle" | "ok" | "fail">("idle");
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(() => () => {
    if (timer.current) clearTimeout(timer.current);
  }, []);

  const onClick = async () => {
    const ok = await copyText(typeof text === "function" ? text() : text);
    setState(ok ? "ok" : "fail");
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(() => setState("idle"), 1500);
  };

  return (
    <Button className={className} variant="default" style={style} onClick={() => void onClick()} data-testid="copy-text-button">
      {state === "ok" ? "복사됨" : state === "fail" ? "복사 실패" : label}
    </Button>
  );
}
