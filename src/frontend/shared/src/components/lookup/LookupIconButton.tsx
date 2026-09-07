"use client";

import type { CSSProperties } from "react";
import { ActionIcon } from "@mantine/core";
import { IconExternalLink } from "@tabler/icons-react";

export interface LookupIconButtonProps {
  /** 클릭 시 호출 (상세/선택 팝업 열기). */
  onClick: () => void;
  /** 비활성화. */
  disabled?: boolean;
  /** 접근성 라벨. default: "상세 검색". */
  ariaLabel?: string;
  /** 툴팁. 미지정 시 ariaLabel 사용. */
  title?: string;
  /** 아이콘 픽셀 크기. default 14. */
  size?: number;
  /** wrapper className (테마/hover 등). */
  className?: string;
  /** 기본 스타일에 병합/오버라이드. (예: LookupTextField 내부 절대배치) */
  style?: CSSProperties;
}

/**
 * 팝업을 여는 아이콘 버튼 (Mantine `ActionIcon` + `IconExternalLink`).
 *
 * IOR(품목×공정×자원 오버라이드) 의 LookupTextField 우측 버튼과 동일한 아이콘을
 * 독립 버튼으로 재사용하기 위한 컴포넌트. style prop 으로 입력칸 내부 배치 등 변형해 사용한다.
 */
export function LookupIconButton({
  onClick,
  disabled = false,
  ariaLabel = "상세 검색",
  title,
  size = 14,
  className = "",
  style,
}: LookupIconButtonProps) {
  return (
    <ActionIcon
      type="button"
      variant="subtle"
      size={size + 8}
      onClick={onClick}
      disabled={disabled}
      aria-label={ariaLabel}
      title={title ?? ariaLabel}
      className={`cm-lookup-icon-button ${className}`.trim()}
      style={style}
    >
      <IconExternalLink size={size} aria-hidden="true" focusable="false" />
    </ActionIcon>
  );
}

export default LookupIconButton;
