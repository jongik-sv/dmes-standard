"use client";

/**
 * MDM 화면 공통 골격(TSK-01-03 U2) — shared PageLayout 을 감싸 breadcrumb·screenId·objId 를 그룹 규칙대로 채운다.
 *
 * breadcrumb 는 "마루 MDM > {그룹 폴더 이름} > {title}", objId 는 screenId(= OBJECT_ID, 버튼 RBAC 판정 기준)다.
 * 화면은 PageLayout 대신 이 컴포넌트를 쓴다(design.md §7 인계).
 */
import type { ReactNode } from "react";
import { PageLayout, type PageButton } from "@dk-oasis/shared/layout";
import { MDM_GROUPS, MDM_MENU_ROOT_NAME, type MdmGroupCode } from "./mdm-groups";

export interface MdmPageLayoutProps {
  group: MdmGroupCode;
  screenId: string;
  title: string;
  buttons?: PageButton[];
  className?: string;
  children: ReactNode;
}

export function MdmPageLayout({ group, screenId, title, buttons, className, children }: MdmPageLayoutProps) {
  const breadcrumb = `${MDM_MENU_ROOT_NAME} > ${MDM_GROUPS[group]} > ${title}`;
  return (
    <PageLayout
      title={title}
      breadcrumb={breadcrumb}
      screenId={screenId}
      objId={screenId}
      buttons={buttons}
      className={className}
    >
      {children}
    </PageLayout>
  );
}
