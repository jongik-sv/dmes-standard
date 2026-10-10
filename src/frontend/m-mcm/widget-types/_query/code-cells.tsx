"use client";

/** 코드 형식 열의 배지 그리기 — format.ts 는 shared 런타임을 import 하지 않으므로 그리는 일은 여기서 맡는다(스펙 2차 §2.3). */
import { Badge } from "@dk-oasis/shared/form";

export function renderCodeBadge(text: string) {
  return <Badge label={text} />;
}
