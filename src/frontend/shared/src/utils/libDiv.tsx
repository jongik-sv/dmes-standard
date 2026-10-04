"use client";

/**
 * 사이드바 상태 관리를 위한 Context Provider 및 Hook
 */

import React, { createContext, useContext, useState, type ReactNode } from "react";

interface SidebarContextValue {
  isSidebarOpen: boolean;
  setIsSidebarOpen: React.Dispatch<React.SetStateAction<boolean>>;
  sidebarWidth: number;
  setSidebarWidth: React.Dispatch<React.SetStateAction<number>>;
  isResizing: boolean;
  setIsResizing: React.Dispatch<React.SetStateAction<boolean>>;
  isHeaderHidden: boolean;
  setIsHeaderHidden: React.Dispatch<React.SetStateAction<boolean>>;
}

const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

interface SidebarProviderProps {
  children: ReactNode;
}

/** @deprecated 저장소 안 사용처 없음. */
export function SidebarProvider({ children }: SidebarProviderProps) {
  const [isSidebarOpen, setIsSidebarOpen] = useState(true);

  const [sidebarWidth, setSidebarWidth] = useState(() => {
    if (typeof window === "undefined") return 280;
    const saved = localStorage.getItem("sidebarWidth");
    return saved ? parseInt(saved, 10) : 280;
  });

  const [isResizing, setIsResizing] = useState(false);
  const [isHeaderHidden, setIsHeaderHidden] = useState(false);

  return (
    <SidebarContext.Provider
      value={{
        isSidebarOpen,
        setIsSidebarOpen,
        sidebarWidth,
        setSidebarWidth,
        isResizing,
        setIsResizing,
        isHeaderHidden,
        setIsHeaderHidden,
      }}
    >
      {children}
    </SidebarContext.Provider>
  );
}

/** @deprecated 저장소 안 사용처 없음. */
export function useSidebar(): SidebarContextValue {
  const context = useContext(SidebarContext);
  if (!context) {
    throw new Error("useSidebar must be used within a SidebarProvider");
  }
  return context;
}
