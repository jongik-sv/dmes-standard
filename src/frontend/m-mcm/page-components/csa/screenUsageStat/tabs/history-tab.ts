/** 이용 이력 탭 모듈 — 슬라이스 S6 이 채운다(골격). */
import type { StatTabModule } from "./tab-contract";

export const historyTab: StatTabModule = {
  load: async () => ({}),
  toExport: () => ({ rows: [], columns: [] }),
};
