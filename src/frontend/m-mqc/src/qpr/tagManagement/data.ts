/**
 * 목업 정적 자료(예시 코일 · 양식 35종 · 규칙 표 · 운영 비교 약 1.1MB + 그림 약 0.9MB)를 처음 쓸 때 한 번만 불러온다.
 * 동적 import 라 다른 화면 번들에 섞이지 않는다. 자료는 scripts/mqc-demo/tag/extract.mjs 가 목업에서 꺼낸다.
 */
import type { TagData } from "./engine/types";

let cache: Promise<TagData> | null = null;
export function loadTagData(): Promise<TagData> {
  if (!cache)
    cache = Promise.all([import("./data/tag-data.json"), import("./data/tag-images.json")])
      .then(([d, i]) => ({ ...((d.default ?? d) as unknown as Omit<TagData, "images">), images: (i.default ?? i) as unknown as Record<string, string> }))
      .catch((e: unknown) => {
        cache = null;
        throw e;
      });
  return cache;
}
