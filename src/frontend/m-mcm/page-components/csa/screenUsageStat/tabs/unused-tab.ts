/** 미사용 화면 탭 모듈 — 슬라이스 S5 가 채운다(골격). */
import type { StatTabModule } from "./tab-contract";

export const unusedTab: StatTabModule = {
  load: async () => ({}),
  toExport: () => ({ rows: [], columns: [] }),
};
