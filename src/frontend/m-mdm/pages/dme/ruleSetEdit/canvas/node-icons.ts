/** 외관 아이콘 키 → Tabler 아이콘(S1 §2.4). 노드(Task 2)와 패널(Task 3)이 함께 쓴다. */
import {
  IconAlertTriangle, IconCalculator, IconCalendar, IconChecks, IconCoin, IconDatabase, IconFilter, IconFlag, IconRuler2, IconScale,
  IconSettings, IconTruck, type TablerIcon,
} from "@tabler/icons-react";

import type { NodeIcon } from "../node-style";

export const NODE_ICON_COMPONENT: Readonly<Record<NodeIcon, TablerIcon>> = {
  calc: IconCalculator, check: IconChecks, filter: IconFilter, calendar: IconCalendar, money: IconCoin, alert: IconAlertTriangle,
  database: IconDatabase, ruler: IconRuler2, scale: IconScale, truck: IconTruck, settings: IconSettings, flag: IconFlag,
};
