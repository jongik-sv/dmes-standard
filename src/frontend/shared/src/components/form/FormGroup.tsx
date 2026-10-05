"use client";

import "./form.css";
import React, {
  Children,
  cloneElement,
  isValidElement,
  useId,
  type ReactElement,
  type ReactNode,
  type CSSProperties,
} from "react";
import { Input } from "@mantine/core";
// 배럴(../../mdm-meta)을 거치지 않는다 — 배럴의 화면 값 검증(validate.ts)이 식 평가기(evalex·decimal.js)를 form 묶음에 끌어들인다.
import { MdmMetaCard, mdmCardTipOptions } from "../../mdm-meta/MdmMetaCard";
import { resolveCaption } from "../../mdm-meta/caption";
import { useMdmCaptionPriority, useMdmColumn, useMdmMetaActive } from "../../mdm-meta/context";
import { LabelNameTip } from "./LabelNameTip";
import { HoverTipPortal, useHoverTip } from "./useHoverTip";

export interface FormGroupProps {
  /**
   * 라벨. 비우면(undefined) `name` 이 있을 때 MDM 폼 캡션(labelMid → labelLong → labelShort → columnName), 그것도 없으면 `name`.
   * 공급자가 `captionPriority="mdm"` 이면 MDM 캡션이 적은 값을 이긴다(spec B1·B2).
   */
  label?: string;
  /**
   * MDM 컬럼 사전 연결 키 — 화면 필드 이름(`noticeTitle`·`TITLE`). 물리명으로 바꿔(`codeNm` → `CODE_NM`) 캡션·툴팁 메타를 찾는다.
   * 포털 탭(MDM 공급자) 밖에서는 쓰지 않는다. FormGroup 은 입력값을 보지 않는다 — 폼 검증은 화면이 훅 결과를 `error` 로 준다.
   */
  name?: string;
  /** 명시 물리명(이름보다 우선). `false` 면 MDM 연결을 끈다(spec B6). */
  meta?: string | false;
  required?: boolean;
  children?: ReactNode;
  className?: string;
  labelWidth?: number;
  style?: CSSProperties;
  error?: string;
  /**
   * 라벨 hover·필드 focus 시 표시되는 툴팁(글자 또는 React 노드). 없고 MDM 메타가 있으면 MdmMetaCard 를 띄운다.
   * 둘 다 없어도 포털 탭(MDM 공급자) 안이면 라벨 hover 때 라벨 글자 + 흐린 글자 `name` 툴팁을 띄운다(필드 focus·스크린리더 설명은 없다).
   */
  tip?: string | ReactNode;
}

function mergeIds(...values: Array<unknown>): string | undefined {
  const ids = values
    .flatMap((value) => (typeof value === "string" ? value.split(/\s+/) : []))
    .filter(Boolean);
  return ids.length > 0 ? [...new Set(ids)].join(" ") : undefined;
}

export function FormGroup({
  label: labelProp,
  required = false,
  children,
  className = "",
  labelWidth = 120,
  style,
  error,
  tip: tipProp,
  name,
  meta,
}: FormGroupProps) {
  // MDM 화면 메타 — 공급자(포털 탭) 밖이거나 name·meta 가 없으면 아무것도 부르지 않고 예전과 같다.
  const mdm = useMdmColumn(name, meta);
  const captionPriority = useMdmCaptionPriority();
  const label = name ? resolveCaption(mdm.column, "form", labelProp, captionPriority, name) : labelProp;
  const tip: ReactNode =
    tipProp ?? (mdm.column ? <MdmMetaCard column={mdm.column} domain={mdm.domain} /> : undefined);
  // 사전에 없는 라벨(name 이 없거나 사전 결과가 없음) — 공급자 안에서만 라벨 글자 툴팁. 받는 중(loading)에는 띄우지 않아 카드로 바뀔 때 깜박이지 않는다.
  const inMdmScope = useMdmMetaActive();
  const fallbackTip: ReactNode =
    !tip && !mdm.loading && inMdmScope && label ? <LabelNameTip label={label} name={name} /> : undefined;
  const hoverTip = tip || fallbackTip;
  const tipIsText = typeof tip === "string" || (!tip && !!fallbackTip);
  // MDM HTML 설명 카드(화면이 tip 을 주지 않았을 때만): 마우스가 들어갈 수 있는 넓은 툴팁으로 띄우고, 스크린리더 사본은 글자 설명으로 둔다
  // (HTML 의 링크가 보이지 않는 채 Tab 순서에 들지 않게). 그 밖의 tip 은 예전 그대로다.
  const htmlTipOptions = tipProp == null ? mdmCardTipOptions(mdm.column) : undefined;
  const srTip: ReactNode =
    htmlTipOptions && mdm.column ? <MdmMetaCard column={mdm.column} domain={mdm.domain} textOnly /> : tip;
  const generatedId = useId();
  const labelId = `${generatedId}-label`;
  const controlId = `${generatedId}-control`;
  const tipId = `${generatedId}-tip`;
  const errorId = `${generatedId}-error`;
  const singleChild =
    Children.count(children) === 1 && isValidElement(children)
      ? (children as ReactElement<Record<string, unknown>>)
      : null;
  const resolvedControlId =
    singleChild && typeof singleChild.props.id === "string" ? singleChild.props.id : controlId;
  // 툴팁은 라벨 박스 기준으로 document.body 포털(position:fixed)에 띄운다 — 위치 판정·포털·Mantine Tooltip 비채택 사유는 useHoverTip.tsx.
  const { anchorRef: labelRef, tipPos, showTip, hideTip, box } = useHoverTip<HTMLLabelElement>(tipIsText, htmlTipOptions);

  const enhancedChildren = (() => {
    if (!singleChild) {
      return children;
    }

    const child = singleChild;
    if (child.type === React.Fragment) return children;

    const childProps = child.props;
    const hasExplicitName =
      typeof childProps["aria-label"] === "string" ||
      typeof childProps["aria-labelledby"] === "string";

    return cloneElement(child, {
      id: resolvedControlId,
      ...(hasExplicitName ? {} : { "aria-labelledby": labelId }),
      "aria-describedby": mergeIds(
        childProps["aria-describedby"],
        tip ? tipId : undefined,
        error ? errorId : undefined
      ),
      ...(error && childProps["aria-invalid"] == null ? { "aria-invalid": true } : {}),
    });
  })();

  return (
    <div className={`form-group ${className}`.trim()} style={style}>
      <Input.Label
        ref={labelRef}
        id={labelId}
        htmlFor={resolvedControlId}
        className={`form-group-label${hoverTip ? " has-tip" : ""}`}
        style={{ width: labelWidth, minWidth: labelWidth }}
      >
        {/* 라벨 박스는 labelWidth 고정폭이라 텍스트 밖 여백까지 hover 로 잡힌다.
            트리거를 텍스트 span 으로 좁혀 "라벨 위에 정확히 올렸을 때" 만 뜨게 한다. */}
        {hoverTip ? (
          <span className="form-tip-trigger" onMouseEnter={showTip} onMouseLeave={hideTip}>
            {required && <span className="form-required">*</span>}
            {label}
          </span>
        ) : (
          <>
            {required && <span className="form-required">*</span>}
            {label}
          </>
        )}
      </Input.Label>
      {/* 키보드 사용자는 라벨에 마우스를 올릴 수 없으므로, 필드가 focus 를 받으면(캡처 단계 —
          자식이 Input 이든 Radio.Group 이든 별도 onFocus prop 계약 없이 동작) 마우스 hover 와
          동일한 툴팁을 띄운다. 스크린리더는 focus 여부와 무관하게 aria-describedby 로 계속 읽는다. */}
      <div
        className="form-group-field"
        onFocusCapture={tip ? showTip : undefined}
        onBlurCapture={tip ? hideTip : undefined}
      >
        {enhancedChildren}
        {tip && (
          <span id={tipId} className="form-sr-only">
            {srTip}
          </span>
        )}
        {error && (
          <span id={errorId} className="form-error-message" role="alert">
            {error}
          </span>
        )}
      </div>
      {hoverTip && (
        <HoverTipPortal tipPos={tipPos} box={box}>
          {hoverTip}
        </HoverTipPortal>
      )}
    </div>
  );
}
