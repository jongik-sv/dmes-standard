"use client";

/**
 * MdmFieldLabel — th 안이나 아무 라벨 자리에 넣는 인라인 라벨. 캡션을 MDM 컬럼 사전에서 고르고(spec B1·B2),
 * 사전에 있으면 마우스를 올리거나 포커스가 들어올 때 `MdmMetaCard`(컬럼·도메인 정보)를 툴팁으로 띄운다(B3·B8).
 *
 * 상세 영역을 th/td 표로 그리는 화면(`DETAIL_LABEL_CELL`)은 `FormGroup` 을 쓰지 않아 라벨 툴팁이 없었다. 그 자리에 이 부품을 둔다.
 * `FormGroup name` 과 같은 규칙(`name` → 물리명 D7, `meta`, 캡션 우선순위, 툴팁 모양·위치·aria)을 따른다.
 *
 * - 공급자(포털 탭) 밖이거나 사전에 없거나 아직 못 받았으면 `label ?? name` 글자 그대로이고 요청·툴팁이 없다. 값은 단순 텍스트와 같은 DOM 이다
 *   (`className`·`style` 을 줬을 때만 그 값을 가진 `<span>` 으로 감싼다).
 * - 사전에 있으면 글자가 `span.form-tip-trigger` 가 된다. 이 span 은 키보드로 닿고(tabIndex 0) hover·focus 때 `.form-tip-text--portal` 을
 *   document.body 에 띄운다. 스크린리더 설명(`aria-describedby`)은 body 로 포털한 `.form-sr-only` 에 두므로 th 의 글자·접근 이름은 늘지 않는다.
 * - 툴팁 모양은 form.css(`.form-tip-text`)가 정한다 — 호스트 앱이 `@dk-oasis/shared/form.css` 를 싣는다(포털은 이미 싣는다).
 *
 * 배럴(`../components/form`)을 거치지 않는다 — 배럴은 입력 부품 전부를 mdm-meta 묶음에 끌어들인다.
 */
import { useId, type CSSProperties } from "react";
import { createPortal } from "react-dom";
import { HoverTipPortal, useHoverTip } from "../components/form/useHoverTip";
import { MdmMetaCard } from "./MdmMetaCard";
import { resolveCaption } from "./caption";
import { useMdmCaptionPriority, useMdmColumn } from "./context";
import type { MdmCaptionKind } from "./types";

export interface MdmFieldLabelProps {
  /** 화면 키 — 물리명으로 바꿔(`noticeTitle` → `NOTICE_TITLE`, `TITLE`) 사전에서 찾는다(D7). 사전에 없을 때 `label` 도 없으면 이 값이 글자로 보인다. */
  name: string;
  /** 명시 물리명(이름보다 우선). `false` 면 MDM 연결을 끈다(spec B6). */
  meta?: string | false;
  /** 명시 캡션(B1) — 기본(`explicit`)에서는 이 값이 이기고, 공급자가 `captionPriority="mdm"` 이면 MDM 캡션이 이긴다. */
  label?: string;
  /** 라벨 뒤에 " *" 를 붙인다(필수 표시, 색 없음). */
  required?: boolean;
  /** 캡션 칸 선택(B2) — `form`(기본)은 labelMid → labelLong → labelShort → columnName, `grid` 는 labelShort 부터. */
  kind?: MdmCaptionKind;
  className?: string;
  style?: CSSProperties;
}

export function MdmFieldLabel({
  name,
  meta,
  label,
  required = false,
  kind = "form",
  className,
  style,
}: MdmFieldLabelProps) {
  const { column, domain } = useMdmColumn(name, meta);
  const captionPriority = useMdmCaptionPriority();
  const descId = `${useId()}-tip`;
  // 카드는 글자 툴팁보다 크다 — 위쪽 공간 판정이 노드 툴팁 높이를 쓴다.
  const { anchorRef, tipPos, showTip, hideTip } = useHoverTip<HTMLSpanElement>(false);

  const caption = resolveCaption(column, kind, label, captionPriority, name);
  const text = required ? `${caption} *` : caption;

  if (!column) {
    // 단순 텍스트와 같은 DOM. 꾸밈(className·style)을 받았을 때만 span.
    return className || style ? (
      <span className={className} style={style}>
        {text}
      </span>
    ) : (
      <>{text}</>
    );
  }

  const card = <MdmMetaCard column={column} domain={domain} />;
  return (
    <>
      <span
        ref={anchorRef}
        className={className ? `form-tip-trigger ${className}` : "form-tip-trigger"}
        style={style}
        tabIndex={0}
        aria-describedby={descId}
        onMouseEnter={showTip}
        onMouseLeave={hideTip}
        onFocus={showTip}
        onBlur={hideTip}
      >
        {text}
      </span>
      {typeof document !== "undefined" &&
        createPortal(
          <span id={descId} className="form-sr-only">
            {card}
          </span>,
          document.body
        )}
      <HoverTipPortal tipPos={tipPos}>{card}</HoverTipPortal>
    </>
  );
}
