"use client";

/**
 * MdmHeaderLabel — HTML 설명 카드(descriptionHtml)를 가진 MDM 열의 머리글 캡션(ag-grid 기본 머리글의 innerHeaderComponent, 내부용).
 *
 * ag-grid 머리글 툴팁은 그리드 상자(.ag-root-wrapper, overflow:hidden) 안에 붙고 0×0 감싸개라 위치 보정·높이 상한이 안 된다. 그래서 HTML 카드는
 * 툴팁 대신 이 라벨에 마우스를 올릴 때 `useHoverTip` 상호작용 모드로 document.body 포털에 띄운다(FormGroup·MdmFieldLabel 과 같은 상자 —
 * 화면 안 위치 보정, 화면 높이 상한, 150ms 유예, Escape). 정렬·필터 아이콘·끌기·누름 정렬은 ag-grid 기본 머리글 그대로다
 * (tests/unit/aggrid-inner-header-capability.unit.test.ts).
 *
 * - 안쪽 컴포넌트가 있으면 ag-grid 는 머리글 글자를 고치지 않는다 — 이 라벨이 `displayName` 을 그리고 refresh 때 새 값으로 다시 그린다.
 * - ag-grid React 는 사용자 컴포넌트를 `div.ag-react-container` 에 넣는다. 그 감싸개에 `mdm-header-label-host`(grid.css 의 display:contents)를
 *   달아 라벨 글자가 `.ag-header-cell-text` 의 말줄임을 그대로 받게 한다.
 * - 스크린리더 설명은 MdmFieldLabel 처럼 body 로 포털한 `.form-sr-only` 글자 사본(textOnly — 숨은 링크가 Tab 순서에 들지 않게)을 aria-describedby 로 잇는다.
 * - 툴팁 모양(.form-tip-text·.form-sr-only)은 호스트가 싣는 `@dk-oasis/shared/form.css` 를 쓴다(포털은 이미 싣는다).
 */
import { useId, useLayoutEffect } from "react";
import { createPortal } from "react-dom";
import { HoverTipPortal, useHoverTip } from "../form/useHoverTip";
import { MdmMetaCard, mdmCardTipOptions } from "../../mdm-meta/MdmMetaCard";
import type { MdmDomainMeta, MdmScreenColumn } from "../../mdm-meta/types";

/** colDef.headerComponentParams.innerHeaderComponentParams 로 넘기는 값. */
export interface MdmHeaderLabelParams {
  mdmColumn: MdmScreenColumn;
  mdmDomain: MdmDomainMeta | null;
}

/** ag-grid 가 주는 안쪽 머리글 인자 중 쓰는 것(+ innerHeaderComponentParams 를 펼친 값). */
export interface MdmHeaderLabelProps extends Partial<MdmHeaderLabelParams> {
  displayName?: string;
  innerHeaderComponentParams?: Partial<MdmHeaderLabelParams>;
  /** ag-grid React 가 넣어 주는 감싸개(div.ag-react-container). */
  reactContainer?: HTMLElement;
}

/** 라벨 감싸개에 다는 클래스 — grid.css 가 display:contents 로 둔다. */
export const MDM_HEADER_LABEL_HOST_CLASS = "mdm-header-label-host";

export function MdmHeaderLabel(props: MdmHeaderLabelProps) {
  const column = props.innerHeaderComponentParams?.mdmColumn ?? props.mdmColumn ?? null;
  const domain = props.innerHeaderComponentParams?.mdmDomain ?? props.mdmDomain ?? null;
  const caption = props.displayName ?? "";
  const descId = `${useId()}-tip`;
  // 카드는 머리글 아래로 크게 열린다 — 위쪽 공간 판정·폭·상호작용은 HTML 카드 옵션(mdmCardTipOptions).
  const { anchorRef, tipPos, showTip, hideTip, box } = useHoverTip<HTMLSpanElement>(
    false,
    mdmCardTipOptions(column)
  );

  const host = props.reactContainer;
  useLayoutEffect(() => {
    host?.classList.add(MDM_HEADER_LABEL_HOST_CLASS);
  }, [host]);

  if (!column) return <>{caption}</>;

  return (
    <>
      <span
        ref={anchorRef}
        className="mdm-header-label"
        aria-describedby={descId}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
      >
        {caption}
      </span>
      {typeof document !== "undefined" &&
        createPortal(
          <span id={descId} className="form-sr-only">
            <MdmMetaCard column={column} domain={domain} textOnly />
          </span>,
          document.body
        )}
      <HoverTipPortal tipPos={tipPos} box={box}>
        <MdmMetaCard column={column} domain={domain} />
      </HoverTipPortal>
    </>
  );
}
