/** 탭 등록표 — page.tsx 가 조회·검사·엑셀을 이 표로 부른다. 슬라이스는 이 파일을 고치지 않는다. */
import type { StatTab } from "../types";

import { deptTab } from "./dept-tab";
import { historyTab } from "./history-tab";
import { overviewTab } from "./overview-tab";
import { screenTab } from "./screen-tab";
import type { StatTabModule } from "./tab-contract";
import { unusedTab } from "./unused-tab";
import { userTab } from "./user-tab";

export const TAB_MODULES: Record<StatTab, StatTabModule> = {
  overview: overviewTab,
  screen: screenTab,
  dept: deptTab,
  user: userTab,
  unused: unusedTab,
  history: historyTab,
};
