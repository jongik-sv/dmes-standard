"use client";

import { DEFAULT_CLASS_PREFIX, snapCss, styleHref } from "./styles";

/**
 * 맞춤 안내선 규칙(`${접두}-snap-guide`, `data-axis="x"|"y"`)을 문서에 넣는다. 안내선 div 의 자리·길이·굵기(1/zoom)는
 * 흐름 좌표 층 안에서 캔버스가 인라인으로 준다(룰 세트 편집기 styles/snap.ts 와 같다).
 */
export function SnapGuideStyle({ classPrefix = DEFAULT_CLASS_PREFIX }: { classPrefix?: string }) {
  return (
    <style href={styleHref("snap", classPrefix)} precedence="default">
      {snapCss(classPrefix)}
    </style>
  );
}
