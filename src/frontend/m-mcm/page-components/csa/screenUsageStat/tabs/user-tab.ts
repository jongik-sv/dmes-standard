/** 사용자별 탭 모듈 — 슬라이스 S4 가 채운다(골격). */
import type { StatTabModule } from "./tab-contract";

export const userTab: StatTabModule = {
  load: async () => ({}),
  toExport: () => ({ rows: [], columns: [] }),
};
