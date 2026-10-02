"use client";

/**
 * 상세 표의 제목 줄 — MDM 컬럼 사전 연결(spec 2026-10-03-mdm-screen-meta-validation §7)의 상세 폼 쪽 파일럿.
 *
 * 상세 표(`DETAIL_*` th/td)는 FormGroup 을 쓰지 않는다(screen-patterns §B). 그래서 FormGroup `name` 이 해 주던 일을
 * 직접 한다: 라벨은 `MdmFieldLabel`(캡션 = 적은 "제목" 또는 MDM 폼 캡션 labelMid → …, 올리면 MDM 컬럼·도메인 카드 툴팁),
 * 값 검사는 `useMdmColumn` 결과(column)로 `validateMdmValue` 를 불러 `Input error` 로 보인다(렌더마다 부르지만 요청을 걸지 않는다 —
 * 메타 요청은 `useMdmColumn` 등록 한 번뿐이라 MDM 장애 중에도 글자마다 요청이 나가지 않는다). 포털 탭 밖(공급자 없음)에서는
 * 훅이 아무것도 부르지 않아 예전과 같은 "제목" 라벨(툴팁 없음)이고 검사도 없다.
 * 캡션 우선순위는 화면이 정한다 — `page.tsx` 가 `captionPriority="mdm"` 으로 감싸므로 MDM 이 있으면 MDM 캡션, 없으면 "제목".
 *
 * 오류 문구 우선순위: 저장 때 서버·저장 전 검사가 준 `error` > 입력 중 화면 검사. 빈 칸의 필수 검사는 저장 때 한다.
 */
import { useState } from "react";

import { Input } from "@dk-oasis/shared/form";
import { DETAIL_LABEL_CELL, DETAIL_VALUE_CELL } from "@dk-oasis/shared/layout";
import {
  MdmFieldLabel,
  resolveCaption,
  useMdmCaptionPriority,
  useMdmColumn,
  validateMdmValue,
} from "@dk-oasis/shared/mdm-meta";

import { TITLE_MAX } from "./types";

/** MDM 컬럼 사전의 물리명이자 폼 필드 키. */
const NAME = "TITLE";
/** MDM 에 없거나 공급자 밖일 때 쓰는 라벨. */
const FALLBACK_CAPTION = "제목";

export interface NoticeTitleRowProps {
  value: string;
  disabled?: boolean;
  /** 서버 또는 저장 전 검사가 이 칸에 준 오류. 값을 고치면 화면이 지운다. */
  error?: string;
  onChange: (value: string) => void;
}

export function NoticeTitleRow({
  value,
  disabled,
  error,
  onChange,
}: NoticeTitleRowProps) {
  // 열(그리드 key)이 이미 TITLE 을 등록했지만, 이 줄이 단독으로 쓰여도 메타를 받도록 직접 등록한다(요청은 한 틱에 묶인다).
  const { column } = useMdmColumn(NAME);
  const priority = useMdmCaptionPriority();
  const [touched, setTouched] = useState(false);

  // 입력 칸 이름(aria-label) — th 의 MdmFieldLabel 과 같은 규칙(적은 "제목" 대 MDM 폼 캡션 labelMid → …)이라 보이는 글자와 늘 같다.
  const caption = resolveCaption(column, "form", FALLBACK_CAPTION, priority, NAME);
  const clientIssue =
    column && (touched || value !== "")
      ? validateMdmValue(column, value)?.message
      : undefined;

  return (
    <tr>
      <th style={DETAIL_LABEL_CELL}>
        <MdmFieldLabel name={NAME} label={FALLBACK_CAPTION} required />
      </th>
      <td style={DETAIL_VALUE_CELL}>
        <Input
          value={value}
          maxLength={TITLE_MAX}
          placeholder="홈 화면 목록에 보이는 제목"
          disabled={disabled}
          aria-label={caption}
          error={error ?? clientIssue}
          onChange={(v) => {
            setTouched(true);
            onChange(v);
          }}
        />
      </td>
    </tr>
  );
}
