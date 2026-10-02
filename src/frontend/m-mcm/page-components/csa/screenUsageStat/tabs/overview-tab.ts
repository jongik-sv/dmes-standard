/** 개요 탭 모듈 — 슬라이스 S1 이 채운다(골격). */
import type { StatTabModule } from "./tab-contract";

export const overviewTab: StatTabModule = {
  load: async () => ({}),
  toExport: () => ({ rows: [], columns: [] }),
};
