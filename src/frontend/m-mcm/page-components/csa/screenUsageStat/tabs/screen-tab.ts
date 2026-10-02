/** 화면별 탭 모듈 — 슬라이스 S2 가 채운다(골격). */
import type { StatTabModule } from "./tab-contract";

export const screenTab: StatTabModule = {
  load: async () => ({}),
  toExport: () => ({ rows: [], columns: [] }),
};
