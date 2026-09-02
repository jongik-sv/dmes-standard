"use client";

import React, { useEffect, useMemo, useRef } from "react";
import "./page-layout.css";
import { canDoButton, useUserButtonRbac } from "../portal-shell/use-user-button-rbac";
import { useTabPage } from "../portal-shell/tab-page-context";
import { emitSearch } from "./search-history-bus";

/**
 * 표준 버튼 액션 코드 (소문자) — 권한관리 화면의 STANDARD_ACTIONS 와 동기화.
 * 자동완성 가이드용. 커스텀 코드도 소문자로 자유 입력 가능.
 */
export type StandardActionCode =
  | "search"
  | "save"
  | "delete"
  | "export"
  | "import"
  | "print"
  | "approve"
  | "reject"
  | "confirm"
  | "cancel"
  | "copy";

export interface PageButton {
  id: string;
  label: string;
  onClick: () => void;
  type?: "primary" | "save" | "close" | "light" | "cancel";
  disabled?: boolean;
  /**
   * Two-tier RBAC button-level 권한 코드 — **소문자** 사용 (예: "search", "save", "delete").
   * 표준 코드는 자동완성 제공. 커스텀 코드도 소문자 자유 입력 가능.
   *
   * 동작:
   *  - 지정 시: 해당 OBJ_ID 의 그 액션 권한이 사용자에게 없으면 자동 비활성.
   *  - 미지정 시 + 페이지에 objId 지정됨: **자동 비활성 (보안 default)** — RBAC 통제 페이지에서
   *    action 누락된 버튼이 무방비로 노출되는 것을 차단.
   *  - 미지정 시 + 페이지에 objId 미지정 (비-RBAC 페이지): 정상 노출.
   */
  action?: StandardActionCode | (string & {});
}

export interface PageLayoutProps {
  title: string;
  className?: string;
  buttons?: PageButton[];
  breadcrumb?: string;
  screenId?: string;
  /**
   * 이 페이지가 속한 보안객체(OBJ_ID). PageButton.action 과 함께 RBAC 자동 비활성에 사용.
   * 미지정 시 RBAC 검사 안 함 (모든 버튼 노출).
   */
  objId?: string;
  children: React.ReactNode;
}

export function PageLayout({
  title,
  className = "",
  buttons = [],
  breadcrumb,
  screenId,
  objId,
  children,
}: PageLayoutProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  // objId 없는 비-RBAC 페이지(디자인 더미·독립 도구 포함)는 인증/RBAC API를 호출하지 않는다.
  const rbacState = useUserButtonRbac(Boolean(objId));
  const { pageId: contextPageId } = useTabPage();
  const footerRightText = screenId || contextPageId || "";

  // 각 버튼에 RBAC 결과 반영:
  //  - objId 미지정 (비-RBAC 페이지) → 모든 버튼 통과
  //  - objId 지정 + action 미지정 → 비활성 (보안 default)
  //  - objId 지정 + action 지정 → 사용자 권한 검사
  // 명시적 disabled (props.disabled=true) 와 RBAC 비활성을 OR 결합.
  const effectiveButtons = useMemo<PageButton[]>(
    () =>
      buttons.map((btn) => {
        const hasAccess = canDoButton(rbacState, objId, btn.action);
        // 조회 버튼 클릭 = "실제 조회" → 최근 입력값 저장 트리거 발행 후 원래 onClick 실행.
        // (effectiveButtons 를 통하므로 F8 단축키 조회에도 동일하게 적용된다.)
        const onClick =
          btn.action === "search"
            ? () => {
                emitSearch(contextPageId);
                btn.onClick();
              }
            : btn.onClick;
        return { ...btn, onClick, disabled: btn.disabled || !hasAccess };
      }),
    [buttons, objId, rbacState, contextPageId]
  );

  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.key !== "F8") return;
      if (document.querySelector(".modal-overlay")) return;
      if (!containerRef.current || containerRef.current.offsetParent === null) return;

      e.preventDefault();
      const primaryBtn = effectiveButtons.find((b) => b.type === "primary" && !b.disabled);
      if (primaryBtn) primaryBtn.onClick();
    };

    document.addEventListener("keydown", handler);
    return () => document.removeEventListener("keydown", handler);
  }, [effectiveButtons]);

  return (
    <div ref={containerRef} className={`page-layout ${className}`.trim()}>
      <div className="page-layout__header">
        <h2 className="page-layout__title">{title}</h2>
        <div className="page-layout__header-buttons">
          {effectiveButtons
            .filter((btn) => btn.type !== "close")
            .map((btn) => (
              <button
                key={btn.id}
                className={`btn btn-${btn.type || "light"}`}
                onClick={btn.onClick}
                disabled={btn.disabled}
                title={
                  btn.action && btn.disabled && !canDoButton(rbacState, objId, btn.action)
                    ? "권한이 없습니다"
                    : undefined
                }
              >
                {btn.label}
              </button>
            ))}
        </div>
      </div>

      {children}

      {(breadcrumb || footerRightText) && (
        <div className="page-layout__footer">
          <span className="page-layout__footer-breadcrumb">{breadcrumb}</span>
          {footerRightText && (
            <span className="page-layout__footer-right">
              <span className="page-layout__footer-screen-id" title={footerRightText}>
                {footerRightText}
              </span>
            </span>
          )}
        </div>
      )}
    </div>
  );
}
