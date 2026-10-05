"use client";

/**
 * 컬럼 사전에 없는 폼 라벨의 글자 툴팁 내용(내부용) — 첫 줄은 라벨 글자, 둘째 줄은 흐린 글자로 화면 키(`name`).
 * `name` 이 없거나 라벨과 같으면 라벨만 보인다. `FormGroup`·`MdmFieldLabel` 이 함께 쓰며(`SearchField` 는 `MdmFieldLabel` 을 거친다)
 * `@dk-oasis/shared/form` 으로 내보내지 않는다. 흐린 글자 모양은 `MdmMetaCard` 의 물리명과 같다.
 */
import type { CSSProperties } from "react";

const keyStyle: CSSProperties = {
  display: "block",
  fontFamily: "var(--font-family-mono, monospace)",
  opacity: 0.75,
};

export function LabelNameTip({ label, name }: { label: string; name?: string | null }) {
  return (
    <>
      {label}
      {name && name !== label ? <span style={keyStyle}>{name}</span> : null}
    </>
  );
}
