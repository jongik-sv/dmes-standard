"use client";

/**
 * MdmHeaderLabel — HTML 설명 카드(descriptionHtml)를 가진 MDM 열의 머리글 캡션(ag-grid 기본 머리글의 innerHeaderComponent, 내부용).
 *
 * ag-grid 머리글 툴팁은 그리드 상자(.ag-root-wrapper, overflow:hidden) 안에 붙고 0×0 감싸개라 위치 보정·높이 상한이 안 된다. 그래서 HTML 카드는
 * 툴팁 대신 이 라벨에 마우스를 올릴 때 `useHoverTip` 상호작용 모드로 document.body 포털에 띄운다(FormGroup·MdmFieldLabel 과 같은 상자 —
 * 화면 안 위치 보정, 화면 높이 상한, 150ms 유예, Escape). 정렬·필터 아이콘·끌기·누름 정렬은 ag-grid 기본 머리글 그대로다
 * (tests/unit/aggrid-inner-header-capability.unit.test.ts).
 *
 * - 표시 지연: ag-grid 머리글 툴팁과 같게 그리드의 `tooltipShowDelay`(AgDataGrid 기본 500ms, 최소 200ms) 뒤에 연다. 머리글에서 행으로
 *   지나가기만 할 때 큰 카드가 첫 행을 덮지 않게 하려는 것이다. 라벨을 누르면(정렬·끌기 시작) 대기를 취소하고 열린 카드를 닫는다.
 *   버튼을 누른 채 들어오면(열 끌기 중) 열지 않는다. 터치로 누르면(태블릿에서 캡션을 탭해 정렬) 브라우저가 뒤따라 보내는 흉내 mouseenter 로는
 *   열지 않는다(터치 pointer 이벤트 뒤 1초).
 * - 안쪽 컴포넌트가 있으면 ag-grid 는 머리글 글자를 고치지 않는다 — 이 라벨이 `displayName` 을 그리고 refresh 때 새 값으로 다시 그린다.
 * - ag-grid React 는 사용자 컴포넌트를 `div.ag-react-container` 에 넣는다. 그 감싸개에 `mdm-header-label-host` 를 달고, 그 클래스를
 *   display:contents 로 두는 규칙을 이 부품이 `<style href precedence>` 로 문서 머리에 한 번 싣는다(호스트가 싣는 CSS 파일에 기대지 않는다 —
 *   Part B §18-3). 라벨 글자가 `.ag-header-cell-text` 의 말줄임을 그대로 받는다.
 * - aria-describedby 는 body 로 포털한 `.form-sr-only` 글자 사본(textOnly — 숨은 링크가 Tab 순서에 들지 않게)을 가리킨다. 마우스·보조기기 탐색
 *   모드용이다 — 키보드 focus 는 ag-grid 머리글 칸(role=columnheader)으로 가므로 이 설명이 읽히지 않을 수 있다. 머리글 칸의 키보드 지원은 범위 밖이다.
 * - 툴팁 모양(.form-tip-text·.form-sr-only)은 호스트가 싣는 `@dk-oasis/shared/form.css` 를 쓴다(포털은 이미 싣는다).
 */
import {
  useId,
  useLayoutEffect,
  useMemo,
  useRef,
  type MouseEvent as ReactMouseEvent,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { createPortal } from "react-dom";
import { HoverTipPortal, useHoverTip, type HoverTipOptions } from "../form/useHoverTip";
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
  /** ag-grid 그리드 api(표시 지연 tooltipShowDelay 를 읽는다). */
  api?: { getGridOption?: (key: "tooltipShowDelay") => unknown };
}

/** 라벨 감싸개에 다는 클래스 — 이 부품이 싣는 규칙이 display:contents 로 둔다. */
export const MDM_HEADER_LABEL_HOST_CLASS = "mdm-header-label-host";
/**
 * 그리드가 tooltipShowDelay 를 정하지 않았을 때의 표시 지연. AgDataGrid 의 기본값(`GRID_TOOLTIP_SHOW_DELAY_MS`)이 이 값을 그대로 쓴다 —
 * AgDataGrid 는 늘 값을 넘기므로 라벨이 이 값을 직접 쓰는 것은 다른 ag-grid 에 달 때뿐이다.
 */
export const MDM_HEADER_LABEL_DEFAULT_SHOW_DELAY_MS = 500;
/** ag-grid 는 tooltipShowDelay 를 200ms 아래로 내리지 않는다(TooltipStateManager). */
const MIN_SHOW_DELAY_MS = 200;
/** 터치 pointer 이벤트 뒤 이 시간 안의 mouseenter 는 브라우저가 흉내 낸 것으로 보고 거른다. */
const TOUCH_COMPAT_MOUSE_MS = 1000;

/** 감싸개를 없는 셈 쳐서 라벨 글자가 머리글 글자 칸의 말줄임·줄바꿈을 그대로 받게 한다. */
export const MDM_HEADER_LABEL_CSS = `.ag-header-cell-text > .${MDM_HEADER_LABEL_HOST_CLASS} { display: contents; }`;

function MdmHeaderLabelStyle() {
  return (
    <style href="cm-mdm-header-label" precedence="default">
      {MDM_HEADER_LABEL_CSS}
    </style>
  );
}

export function MdmHeaderLabel(props: MdmHeaderLabelProps) {
  const column = props.innerHeaderComponentParams?.mdmColumn ?? props.mdmColumn ?? null;
  const domain = props.innerHeaderComponentParams?.mdmDomain ?? props.mdmDomain ?? null;
  const caption = props.displayName ?? "";
  const descId = `${useId()}-tip`;
  const api = props.api;
  // 카드는 머리글 아래로 크게 열린다 — 위쪽 공간 판정·폭·상호작용은 HTML 카드 옵션(mdmCardTipOptions), 표시 지연은 그리드 툴팁과 같게.
  const tipOptions = useMemo<HoverTipOptions | undefined>(() => {
    const base = mdmCardTipOptions(column);
    if (!base) return undefined;
    const configured = api?.getGridOption?.("tooltipShowDelay");
    const delay =
      typeof configured === "number"
        ? Math.max(MIN_SHOW_DELAY_MS, configured)
        : MDM_HEADER_LABEL_DEFAULT_SHOW_DELAY_MS;
    return { ...base, showDelayMs: delay };
  }, [column, api]);
  const { anchorRef, tipPos, showTip, hideTip, closeTip, box } = useHoverTip<HTMLSpanElement>(
    false,
    tipOptions
  );

  /** 마지막 터치 pointer 이벤트 시각 — 탭 뒤 흉내 mouseenter 를 거른다. */
  const lastTouchRef = useRef(0);

  const host = props.reactContainer;
  useLayoutEffect(() => {
    host?.classList.add(MDM_HEADER_LABEL_HOST_CLASS);
  }, [host]);

  if (!column) return <>{caption}</>;

  const noteTouch = (e: ReactPointerEvent<HTMLSpanElement>) => {
    if (e.pointerType === "touch") lastTouchRef.current = Date.now();
  };
  const onMouseEnter = (e: ReactMouseEvent<HTMLSpanElement>) => {
    // 버튼을 누른 채 들어오면(열 끌기·머리글 위 끌기 중) 열지 않는다.
    if (e.buttons !== 0) return;
    // 터치 탭 뒤 브라우저가 흉내 낸 mouseenter 면 열지 않는다(폼 라벨은 예전 그대로 — 그리드 머리글만).
    if (Date.now() - lastTouchRef.current < TOUCH_COMPAT_MOUSE_MS) return;
    showTip(e);
  };
  const onPointerDown = (e: ReactPointerEvent<HTMLSpanElement>) => {
    noteTouch(e);
    closeTip();
  };

  return (
    <>
      <span
        ref={anchorRef}
        className="mdm-header-label"
        aria-describedby={descId}
        onMouseEnter={onMouseEnter}
        onMouseLeave={hideTip}
        onPointerEnter={noteTouch}
        onPointerDown={onPointerDown}
        onPointerUp={noteTouch}
      >
        {caption}
      </span>
      {typeof document !== "undefined" &&
        createPortal(
          <>
            {/* 규칙은 body 포털로 싣는다 — ag-grid React 는 이 부품을 문서에 붙기 전의 감싸개에 그려, 그 자리의 <style> 은 head 로 올라가지 않고
                감싸개 안에 남는다(React 는 포털 컨테이너의 루트 노드로 올린다). */}
            <MdmHeaderLabelStyle />
            <span id={descId} className="form-sr-only">
              <MdmMetaCard column={column} domain={domain} textOnly />
            </span>
          </>,
          document.body
        )}
      <HoverTipPortal tipPos={tipPos} box={box}>
        <MdmMetaCard column={column} domain={domain} />
      </HoverTipPortal>
    </>
  );
}
