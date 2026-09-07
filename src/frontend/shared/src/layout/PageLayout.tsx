"use client";

import React, { useEffect, useMemo, useRef } from "react";
import { Button, Group, Title } from "@mantine/core";
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
  /**
   * 이 버튼만 다른 보안객체로 판정할 때 지정. 미지정 시 PageLayoutProps.objId 사용.
   * 팝업을 여는 버튼은 팝업의 OBJECT_ID 를 넣는다 (서버 BFF rbac-policy 판정과 정합).
   */
  objId?: string;
  /**
   * 최근검색값 저장 이벤트 발행 여부. 미지정 시 기존 동작(action === "search")을 따른다.
   * 액션 코드가 교정되면(searchMtrl 등) 조회 버튼인데도 발행이 조용히 멈추므로 명시 플래그로 고정한다.
   */
  emitSearch?: boolean;
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

/** RBAC 판정 결과를 실어 나르는 내부 표현 — 활성 판정과 툴팁이 같은 값을 쓰게 한다. */
interface ResolvedPageButton extends PageButton {
  hasAccess: boolean;
}

/** 기존 .btn-{type} 시각 구분을 Mantine Button 의 variant/color 로 매핑한다. */
const BUTTON_VARIANT_BY_TYPE: Record<string, "filled" | "default"> = {
  primary: "filled",
  save: "filled",
  cancel: "filled",
  close: "default",
  light: "default",
};
const BUTTON_COLOR_BY_TYPE: Record<string, string | undefined> = {
  primary: undefined, // 테마 primaryColor(dmes) 사용
  save: "gray",
  cancel: "danger",
  close: undefined,
  light: undefined,
};

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
  // 단, 페이지 objId 가 없어도 버튼별 objId 가 하나라도 있으면 훅을 켜야 한다.
  //   훅이 꺼지면 rows=[] · isLoading=false 로 고정돼 해당 버튼들이 영구 비활성으로 굳는다.
  const rbacEnabled = Boolean(objId) || buttons.some((b) => Boolean(b.objId));
  const rbacState = useUserButtonRbac(rbacEnabled);
  const { pageId: contextPageId } = useTabPage();
  const footerRightText = screenId || contextPageId || "";

  // 각 버튼에 RBAC 결과 반영:
  //  - 판정 objId = btn.objId ?? 페이지 objId (팝업 오픈 버튼은 팝업의 OBJECT_ID 로 판정)
  //  - objId 미지정 (비-RBAC 페이지) → 모든 버튼 통과
  //  - objId 지정 + action 미지정 → 비활성 (보안 default)
  //  - objId 지정 + action 지정 → 사용자 권한 검사
  // 명시적 disabled (props.disabled=true) 와 RBAC 비활성을 OR 결합.
  // hasAccess 를 여기서 한 번만 계산해 버튼 활성 판정과 툴팁이 동일 결과를 공유한다.
  //   (툴팁이 페이지 objId 로 따로 판정하면, 버튼 objId 로 활성화된 버튼에 "권한이 없습니다" 오툴팁이 붙는다.)
  const effectiveButtons = useMemo<ResolvedPageButton[]>(
    () =>
      buttons.map((btn) => {
        const hasAccess = canDoButton(rbacState, btn.objId ?? objId, btn.action);
        // 조회 버튼 클릭 = "실제 조회" → 최근 입력값 저장 트리거 발행 후 원래 onClick 실행.
        // (effectiveButtons 를 통하므로 F8 단축키 조회에도 동일하게 적용된다.)
        // 명시 플래그 우선 + 미지정 시 기존 action==="search" 동작 유지 (하위호환).
        // startsWith("search") 류의 접두 매칭은 금지 — 팝업 오픈 버튼(searchItemPopup 등)이 오발화한다.
        const shouldEmitSearch = btn.emitSearch ?? btn.action === "search";
        const onClick = shouldEmitSearch
          ? () => {
              emitSearch(contextPageId);
              btn.onClick();
            }
          : btn.onClick;
        return { ...btn, onClick, disabled: btn.disabled || !hasAccess, hasAccess };
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
      <Group justify="space-between" className="page-layout__header">
        <Title order={2} className="page-layout__title">
          {title}
        </Title>
        <div className="page-layout__header-buttons">
          {effectiveButtons
            .filter((btn) => btn.type !== "close")
            .map((btn) => (
              <Button
                key={btn.id}
                className={`page-button page-button--${btn.type || "light"}`}
                variant={BUTTON_VARIANT_BY_TYPE[btn.type || "light"]}
                color={BUTTON_COLOR_BY_TYPE[btn.type || "light"]}
                onClick={btn.onClick}
                disabled={btn.disabled}
                title={btn.action && btn.disabled && !btn.hasAccess ? "권한이 없습니다" : undefined}
              >
                {btn.label}
              </Button>
            ))}
        </div>
      </Group>

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
