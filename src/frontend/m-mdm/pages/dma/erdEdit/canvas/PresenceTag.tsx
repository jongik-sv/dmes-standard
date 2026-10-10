"use client";

/** 접속자 이름표(스펙 D17) — 다른 세션이 고른 표 위에 붙는다. 사람(UI)은 사용자 ID, LLM(MCP·CLI)은 세션 이름을 쓴다. */
import type { ErdNodeViewer } from "./erd-flow";

export function presenceLabel(v: Pick<ErdNodeViewer, "source" | "userId" | "session">): string {
  return v.source === "UI" ? v.userId : v.session;
}

export function PresenceTag({ viewer }: { viewer: ErdNodeViewer }) {
  return (
    <span
      className="erd-viewer"
      data-source={viewer.source === "UI" ? "ui" : "llm"}
      data-claimed={viewer.claimed ? "" : undefined}
      title={`${viewer.userId} · ${viewer.session}${viewer.claimed ? " · 작업 중" : ""}`}
    >
      {presenceLabel(viewer)}
      {viewer.claimed ? " · 작업 중" : ""}
    </span>
  );
}
