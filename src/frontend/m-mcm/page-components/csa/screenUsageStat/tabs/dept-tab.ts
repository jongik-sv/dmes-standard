/** 부서별 탭 모듈 — 슬라이스 S3 이 채운다(골격). */
import type { StatTabModule } from "./tab-contract";

export const deptTab: StatTabModule = {
  load: async () => ({}),
  toExport: () => ({ rows: [], columns: [] }),
};
