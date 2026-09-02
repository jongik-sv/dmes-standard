"use client";

import React, { createContext, useContext, useMemo, useState } from "react";

export interface ContentBodyProps {
  direction?: "row" | "column";
  root?: boolean;
  children: React.ReactNode;
}

interface MaximizeContextValue {
  maximizedId: string | null;
  setMaximizedId: (id: string | null) => void;
}

const MaximizeContext = createContext<MaximizeContextValue>({
  maximizedId: null,
  setMaximizedId: () => {},
});

/**
 * ContentBody 하위 ContentPanel 들의 최대화/복원 상태에 접근한다.
 * 반환: { maximizedId, setMaximizedId, isMaximized(panelId), toggle(panelId) }
 */
export function useContentMaximize() {
  const ctx = useContext(MaximizeContext);
  return useMemo(
    () => ({
      maximizedId: ctx.maximizedId,
      setMaximizedId: ctx.setMaximizedId,
      isMaximized: (panelId: string) => ctx.maximizedId === panelId,
      toggle: (panelId: string) =>
        ctx.setMaximizedId(ctx.maximizedId === panelId ? null : panelId),
    }),
    [ctx],
  );
}

export function ContentBody({ direction = "row", root, children }: ContentBodyProps) {
  const [maximizedId, setMaximizedId] = useState<string | null>(null);

  const className = [
    "content-body",
    direction === "column" ? "content-body--column" : "",
    root ? "content-body--root" : "",
  ]
    .filter(Boolean)
    .join(" ");

  const value = useMemo<MaximizeContextValue>(
    () => ({ maximizedId, setMaximizedId }),
    [maximizedId],
  );

  return (
    <MaximizeContext.Provider value={value}>
      <div className={className}>{children}</div>
    </MaximizeContext.Provider>
  );
}
