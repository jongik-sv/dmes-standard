export type ItemRow = {
  id: string;
  itemCode: string;
  itemName: string;
  itemType: "제품" | "반제품" | "원자재";
  plant: "김포" | "포항";
  specification: string;
  unit: "EA" | "KG" | "M";
  safetyStock: number;
  leadTime: number;
  useYn: "Y" | "N";
};

export const INITIAL_ITEMS: ItemRow[] = [
  {
    id: "item-001",
    itemCode: "FG-AL-1250",
    itemName: "AL COIL 1.2T × 1250",
    itemType: "제품",
    plant: "김포",
    specification: "A1050 / H24",
    unit: "KG",
    safetyStock: 18000,
    leadTime: 3,
    useYn: "Y",
  },
  {
    id: "item-002",
    itemCode: "SF-SL-0900",
    itemName: "SLIT COIL 0.9T × 320",
    itemType: "반제품",
    plant: "김포",
    specification: "SGCC / Z18",
    unit: "KG",
    safetyStock: 7200,
    leadTime: 2,
    useYn: "Y",
  },
  {
    id: "item-003",
    itemCode: "RM-HR-1600",
    itemName: "HOT ROLLED COIL 1.6T",
    itemType: "원자재",
    plant: "포항",
    specification: "SPHC",
    unit: "KG",
    safetyStock: 34000,
    leadTime: 7,
    useYn: "Y",
  },
  {
    id: "item-004",
    itemCode: "FG-CU-0080",
    itemName: "COPPER STRIP 0.8T",
    itemType: "제품",
    plant: "포항",
    specification: "C1100 / 1/2H",
    unit: "M",
    safetyStock: 4800,
    leadTime: 5,
    useYn: "Y",
  },
  {
    id: "item-005",
    itemCode: "SF-AL-0550",
    itemName: "AL SHEET 0.5T × 550",
    itemType: "반제품",
    plant: "김포",
    specification: "A3003 / H14",
    unit: "EA",
    safetyStock: 1200,
    leadTime: 1,
    useYn: "N",
  },
  {
    id: "item-006",
    itemCode: "RM-SS-1219",
    itemName: "STAINLESS COIL 1.0T",
    itemType: "원자재",
    plant: "포항",
    specification: "STS304 / 2B",
    unit: "KG",
    safetyStock: 9500,
    leadTime: 12,
    useYn: "Y",
  },
  {
    id: "item-007",
    itemCode: "FG-CR-1000",
    itemName: "COLD ROLLED SHEET 1.0T",
    itemType: "제품",
    plant: "김포",
    specification: "SPCC-SD",
    unit: "EA",
    safetyStock: 2600,
    leadTime: 4,
    useYn: "Y",
  },
  {
    id: "item-008",
    itemCode: "SF-CU-0210",
    itemName: "COPPER SLIT 0.2T × 110",
    itemType: "반제품",
    plant: "포항",
    specification: "C1020 / H",
    unit: "M",
    safetyStock: 6500,
    leadTime: 3,
    useYn: "N",
  },
];

export type WorkcenterRow = {
  id: string;
  plant: "김포" | "포항";
  workcenterCode: string;
  workcenterName: string;
  line: string;
  resourceCount: number;
  efficiency: number;
  status: "가동" | "점검" | "비가동";
};

export type ResourceRow = {
  id: string;
  workcenterId: string;
  resourceCode: string;
  resourceName: string;
  resourceType: "설비" | "작업조";
  capacity: number;
  calendar: string;
  priority: number;
  useYn: "Y" | "N";
};

export const WORKCENTERS: WorkcenterRow[] = [
  {
    id: "wc-01",
    plant: "김포",
    workcenterCode: "GMP-SLIT-01",
    workcenterName: "김포 Slitter 1라인",
    line: "SLITTING",
    resourceCount: 3,
    efficiency: 94,
    status: "가동",
  },
  {
    id: "wc-02",
    plant: "김포",
    workcenterCode: "GMP-CUT-02",
    workcenterName: "김포 Shearing 2라인",
    line: "SHEARING",
    resourceCount: 2,
    efficiency: 88,
    status: "가동",
  },
  {
    id: "wc-03",
    plant: "김포",
    workcenterCode: "GMP-PACK-01",
    workcenterName: "김포 포장라인",
    line: "PACKING",
    resourceCount: 2,
    efficiency: 79,
    status: "점검",
  },
  {
    id: "wc-04",
    plant: "포항",
    workcenterCode: "PH-SLIT-01",
    workcenterName: "포항 정밀 Slitter",
    line: "SLITTING",
    resourceCount: 4,
    efficiency: 91,
    status: "가동",
  },
  {
    id: "wc-05",
    plant: "포항",
    workcenterCode: "PH-ROLL-01",
    workcenterName: "포항 압연라인",
    line: "ROLLING",
    resourceCount: 3,
    efficiency: 72,
    status: "비가동",
  },
];

export const INITIAL_RESOURCES: ResourceRow[] = [
  {
    id: "res-01",
    workcenterId: "wc-01",
    resourceCode: "SLT-101",
    resourceName: "Slitter #101",
    resourceType: "설비",
    capacity: 24,
    calendar: "GMP-2SHIFT",
    priority: 1,
    useYn: "Y",
  },
  {
    id: "res-02",
    workcenterId: "wc-01",
    resourceCode: "SLT-102",
    resourceName: "Slitter #102",
    resourceType: "설비",
    capacity: 18,
    calendar: "GMP-2SHIFT",
    priority: 2,
    useYn: "Y",
  },
  {
    id: "res-03",
    workcenterId: "wc-01",
    resourceCode: "TEAM-S11",
    resourceName: "슬리팅 A조",
    resourceType: "작업조",
    capacity: 16,
    calendar: "GMP-DAY",
    priority: 3,
    useYn: "Y",
  },
  {
    id: "res-04",
    workcenterId: "wc-02",
    resourceCode: "CUT-201",
    resourceName: "Shear #201",
    resourceType: "설비",
    capacity: 20,
    calendar: "GMP-2SHIFT",
    priority: 1,
    useYn: "Y",
  },
  {
    id: "res-05",
    workcenterId: "wc-02",
    resourceCode: "TEAM-C21",
    resourceName: "전단 B조",
    resourceType: "작업조",
    capacity: 16,
    calendar: "GMP-DAY",
    priority: 2,
    useYn: "Y",
  },
  {
    id: "res-06",
    workcenterId: "wc-03",
    resourceCode: "PACK-301",
    resourceName: "자동 포장기 #301",
    resourceType: "설비",
    capacity: 14,
    calendar: "GMP-DAY",
    priority: 1,
    useYn: "Y",
  },
  {
    id: "res-07",
    workcenterId: "wc-04",
    resourceCode: "PSL-401",
    resourceName: "Precision Slitter #401",
    resourceType: "설비",
    capacity: 28,
    calendar: "PH-3SHIFT",
    priority: 1,
    useYn: "Y",
  },
  {
    id: "res-08",
    workcenterId: "wc-05",
    resourceCode: "ROLL-501",
    resourceName: "Rolling Mill #501",
    resourceType: "설비",
    capacity: 36,
    calendar: "PH-3SHIFT",
    priority: 1,
    useYn: "N",
  },
];

export const RESOURCE_POOL: Omit<ResourceRow, "workcenterId">[] = [
  {
    id: "pool-01",
    resourceCode: "SLT-108",
    resourceName: "Slitter #108",
    resourceType: "설비",
    capacity: 22,
    calendar: "GMP-2SHIFT",
    priority: 4,
    useYn: "Y",
  },
  {
    id: "pool-02",
    resourceCode: "TEAM-S12",
    resourceName: "슬리팅 B조",
    resourceType: "작업조",
    capacity: 16,
    calendar: "GMP-NIGHT",
    priority: 5,
    useYn: "Y",
  },
  {
    id: "pool-03",
    resourceCode: "QCP-901",
    resourceName: "공정검사 이동조",
    resourceType: "작업조",
    capacity: 8,
    calendar: "COMMON-DAY",
    priority: 9,
    useYn: "Y",
  },
];

export const OUTPUT_TREND = [
  { label: "07/24", value: 842 },
  { label: "07/25", value: 916 },
  { label: "07/26", value: 788 },
  { label: "07/27", value: 1038 },
  { label: "07/28", value: 974 },
  { label: "07/29", value: 1126 },
  { label: "07/30", value: 1084 },
];

export const ORDER_STATUS = [
  { label: "정상", value: 68, color: "#2f7d66" },
  { label: "주의", value: 19, color: "#d79a2b" },
  { label: "지연", value: 9, color: "#c5534c" },
  { label: "보류", value: 4, color: "#78869a" },
];

export type AlertRow = {
  id: string;
  severity: "긴급" | "주의" | "정보";
  orderNo: string;
  itemName: string;
  resource: string;
  issue: string;
  dueAt: string;
  owner: string;
};

export const OPERATION_ALERTS: AlertRow[] = [
  {
    id: "alert-01",
    severity: "긴급",
    orderNo: "WO-260730-018",
    itemName: "AL COIL 1.2T × 1250",
    resource: "SLT-102",
    issue: "납기 예상 6.5시간 초과",
    dueAt: "07/30 14:00",
    owner: "김생산",
  },
  {
    id: "alert-02",
    severity: "주의",
    orderNo: "WO-260730-021",
    itemName: "COPPER STRIP 0.8T",
    resource: "ROLL-501",
    issue: "설비점검과 계획 중첩",
    dueAt: "07/30 17:30",
    owner: "박계획",
  },
  {
    id: "alert-03",
    severity: "주의",
    orderNo: "WO-260731-004",
    itemName: "STS304 COIL 1.0T",
    resource: "PSL-401",
    issue: "원자재 입고 확정 대기",
    dueAt: "07/31 09:00",
    owner: "이자재",
  },
  {
    id: "alert-04",
    severity: "정보",
    orderNo: "WO-260731-012",
    itemName: "CR SHEET 1.0T",
    resource: "CUT-201",
    issue: "대체 자원 자동 배정",
    dueAt: "07/31 13:00",
    owner: "최APS",
  },
];

export type GanttSchedule = {
  id: string;
  title: string;
  status: "작성중" | "확정" | "부분확정";
  plant: "김포" | "포항";
  horizon: string;
  operationCount: number;
  lateCount: number;
};

export type GanttOperation = {
  id: string;
  scheduleId: string;
  plannedOrderId: string;
  itemCode: string;
  itemName: string;
  operationSeq: number;
  operationName: string;
  resourceCode: string;
  startHour: number;
  endHour: number;
  setupHours: number;
  quantity: number;
  status: "SCHEDULED" | "FROZEN" | "STARTED" | "COMPLETED";
  isLate?: boolean;
  isManual?: boolean;
};

export type GanttResource = {
  code: string;
  name: string;
  workCenter: string;
};

export const GANTT_SCHEDULES: GanttSchedule[] = [
  {
    id: "SCH-20260730-01",
    title: "김포 7월 5주 생산계획",
    status: "확정",
    plant: "김포",
    horizon: "07/30 06:00 – 07/30 18:00",
    operationCount: 9,
    lateCount: 1,
  },
  {
    id: "SCH-20260730-02",
    title: "김포 긴급오더 재계획",
    status: "부분확정",
    plant: "김포",
    horizon: "07/30 06:00 – 07/30 18:00",
    operationCount: 4,
    lateCount: 2,
  },
];

export const GANTT_RESOURCES: GanttResource[] = [
  { code: "SLT-101", name: "Slitter #101", workCenter: "슬리팅 작업장" },
  { code: "SLT-102", name: "Slitter #102", workCenter: "슬리팅 작업장" },
  { code: "CUT-201", name: "Shear #201", workCenter: "전단 작업장" },
  { code: "PACK-301", name: "자동 포장기 #301", workCenter: "포장 작업장" },
];

export const GANTT_OPERATIONS: GanttOperation[] = [
  {
    id: "SOP-0730-0010",
    scheduleId: "SCH-20260730-01",
    plannedOrderId: "PO-260730-011",
    itemCode: "FG-AL-1250",
    itemName: "AL COIL 1.2T × 1250",
    operationSeq: 10,
    operationName: "1차 슬리팅",
    resourceCode: "SLT-101",
    startHour: 0.5,
    endHour: 3.2,
    setupHours: 0.35,
    quantity: 18.4,
    status: "STARTED",
  },
  {
    id: "SOP-0730-0020",
    scheduleId: "SCH-20260730-01",
    plannedOrderId: "PO-260730-019",
    itemCode: "SF-SL-0900",
    itemName: "SLIT COIL 0.9T × 320",
    operationSeq: 10,
    operationName: "정밀 슬리팅",
    resourceCode: "SLT-101",
    startHour: 4.1,
    endHour: 6.4,
    setupHours: 0.25,
    quantity: 12.1,
    status: "SCHEDULED",
  },
  {
    id: "SOP-0730-0030",
    scheduleId: "SCH-20260730-01",
    plannedOrderId: "PO-260730-018",
    itemCode: "FG-AL-1250",
    itemName: "AL COIL 1.2T × 1250",
    operationSeq: 10,
    operationName: "폭 절단",
    resourceCode: "SLT-102",
    startHour: 1.25,
    endHour: 5.6,
    setupHours: 0.4,
    quantity: 26.8,
    status: "FROZEN",
    isLate: true,
    isManual: true,
  },
  {
    id: "SOP-0730-0040",
    scheduleId: "SCH-20260730-01",
    plannedOrderId: "PO-260730-014",
    itemCode: "FG-CR-1000",
    itemName: "COLD ROLLED SHEET 1.0T",
    operationSeq: 20,
    operationName: "전단",
    resourceCode: "CUT-201",
    startHour: 0,
    endHour: 2.7,
    setupHours: 0.2,
    quantity: 3200,
    status: "COMPLETED",
  },
  {
    id: "SOP-0730-0050",
    scheduleId: "SCH-20260730-01",
    plannedOrderId: "PO-260730-026",
    itemCode: "RM-SS-1219",
    itemName: "STAINLESS COIL 1.0T",
    operationSeq: 20,
    operationName: "정밀 전단",
    resourceCode: "CUT-201",
    startHour: 3.4,
    endHour: 6.8,
    setupHours: 0.3,
    quantity: 2100,
    status: "SCHEDULED",
  },
  {
    id: "SOP-0730-0060",
    scheduleId: "SCH-20260730-01",
    plannedOrderId: "PO-260730-009",
    itemCode: "SF-AL-0550",
    itemName: "AL SHEET 0.5T × 550",
    operationSeq: 30,
    operationName: "자동 포장",
    resourceCode: "PACK-301",
    startHour: 2.3,
    endHour: 4.25,
    setupHours: 0.1,
    quantity: 1400,
    status: "FROZEN",
  },
  {
    id: "SOP-0730-0070",
    scheduleId: "SCH-20260730-01",
    plannedOrderId: "PO-260730-025",
    itemCode: "FG-CR-1000",
    itemName: "COLD ROLLED SHEET 1.0T",
    operationSeq: 30,
    operationName: "라벨·포장",
    resourceCode: "PACK-301",
    startHour: 5,
    endHour: 7.3,
    setupHours: 0.15,
    quantity: 2600,
    status: "SCHEDULED",
  },
  {
    id: "SOP-0730-0080",
    scheduleId: "SCH-20260730-01",
    plannedOrderId: "PO-260730-031",
    itemCode: "SF-CU-0210",
    itemName: "COPPER SLIT 0.2T × 110",
    operationSeq: 10,
    operationName: "박판 슬리팅",
    resourceCode: "SLT-102",
    startHour: 6.2,
    endHour: 8.5,
    setupHours: 0.25,
    quantity: 8.7,
    status: "SCHEDULED",
  },
  {
    id: "SOP-0730-0090",
    scheduleId: "SCH-20260730-01",
    plannedOrderId: "PO-260730-033",
    itemCode: "FG-CU-0080",
    itemName: "COPPER STRIP 0.8T",
    operationSeq: 20,
    operationName: "전단",
    resourceCode: "CUT-201",
    startHour: 7.25,
    endHour: 9.4,
    setupHours: 0.2,
    quantity: 1800,
    status: "SCHEDULED",
  },
  {
    id: "SOP-0730-R010",
    scheduleId: "SCH-20260730-02",
    plannedOrderId: "PO-URGENT-004",
    itemCode: "FG-AL-1250",
    itemName: "AL COIL 1.2T × 1250",
    operationSeq: 10,
    operationName: "긴급 슬리팅",
    resourceCode: "SLT-101",
    startHour: 0.25,
    endHour: 2.1,
    setupHours: 0.2,
    quantity: 7.2,
    status: "FROZEN",
    isManual: true,
  },
  {
    id: "SOP-0730-R020",
    scheduleId: "SCH-20260730-02",
    plannedOrderId: "PO-URGENT-006",
    itemCode: "SF-SL-0900",
    itemName: "SLIT COIL 0.9T × 320",
    operationSeq: 10,
    operationName: "재슬리팅",
    resourceCode: "SLT-102",
    startHour: 1.8,
    endHour: 4.8,
    setupHours: 0.35,
    quantity: 9.5,
    status: "SCHEDULED",
    isLate: true,
  },
  {
    id: "SOP-0730-R030",
    scheduleId: "SCH-20260730-02",
    plannedOrderId: "PO-URGENT-004",
    itemCode: "FG-AL-1250",
    itemName: "AL COIL 1.2T × 1250",
    operationSeq: 20,
    operationName: "긴급 전단",
    resourceCode: "CUT-201",
    startHour: 3.2,
    endHour: 5.9,
    setupHours: 0.2,
    quantity: 1200,
    status: "SCHEDULED",
    isLate: true,
  },
  {
    id: "SOP-0730-R040",
    scheduleId: "SCH-20260730-02",
    plannedOrderId: "PO-URGENT-004",
    itemCode: "FG-AL-1250",
    itemName: "AL COIL 1.2T × 1250",
    operationSeq: 30,
    operationName: "긴급 포장",
    resourceCode: "PACK-301",
    startHour: 6.2,
    endHour: 7.6,
    setupHours: 0.1,
    quantity: 1200,
    status: "SCHEDULED",
  },
];

export type QualityCase = {
  id: string;
  requestNo: string;
  status: "검토대기" | "조치진행" | "완료";
  severity: "Critical" | "Major" | "Minor";
  itemCode: string;
  itemName: string;
  lotNo: string;
  defect: string;
  defectQty: number;
  inspectionQty: number;
  process: string;
  owner: string;
  requestedAt: string;
  disposition: string;
};

export const INITIAL_QUALITY_CASES: QualityCase[] = [
  {
    id: "ncr-001",
    requestNo: "NCR-260730-014",
    status: "검토대기",
    severity: "Critical",
    itemCode: "FG-AL-1250",
    itemName: "AL COIL 1.2T × 1250",
    lotNo: "LOT-GM-0730-08",
    defect: "표면 Scratch",
    defectQty: 4,
    inspectionQty: 24,
    process: "SLITTING",
    owner: "정품질",
    requestedAt: "2026-07-30 09:18",
    disposition: "기술 검토 및 재작업 가능 여부 확인 필요",
  },
  {
    id: "ncr-002",
    requestNo: "NCR-260730-011",
    status: "검토대기",
    severity: "Major",
    itemCode: "SF-SL-0900",
    itemName: "SLIT COIL 0.9T × 320",
    lotNo: "LOT-GM-0730-03",
    defect: "폭 공차 초과",
    defectQty: 2,
    inspectionQty: 18,
    process: "SLITTING",
    owner: "한검사",
    requestedAt: "2026-07-30 08:42",
    disposition: "선별 후 재작업",
  },
  {
    id: "ncr-003",
    requestNo: "NCR-260729-027",
    status: "조치진행",
    severity: "Major",
    itemCode: "FG-CU-0080",
    itemName: "COPPER STRIP 0.8T",
    lotNo: "LOT-PH-0729-11",
    defect: "Edge Burr",
    defectQty: 7,
    inspectionQty: 40,
    process: "ROLLING",
    owner: "오품질",
    requestedAt: "2026-07-29 16:20",
    disposition: "외주 연마 진행 / 7월 31일 회수 예정",
  },
  {
    id: "ncr-004",
    requestNo: "NCR-260729-018",
    status: "완료",
    severity: "Minor",
    itemCode: "FG-CR-1000",
    itemName: "COLD ROLLED SHEET 1.0T",
    lotNo: "LOT-GM-0729-09",
    defect: "포장 Label 오기",
    defectQty: 12,
    inspectionQty: 120,
    process: "PACKING",
    owner: "유포장",
    requestedAt: "2026-07-29 13:54",
    disposition: "전량 라벨 재발행 및 교체 완료",
  },
  {
    id: "ncr-005",
    requestNo: "NCR-260728-022",
    status: "완료",
    severity: "Major",
    itemCode: "RM-SS-1219",
    itemName: "STAINLESS COIL 1.0T",
    lotNo: "LOT-PH-0728-07",
    defect: "성분 성적서 누락",
    defectQty: 1,
    inspectionQty: 1,
    process: "INCOMING",
    owner: "배수입",
    requestedAt: "2026-07-28 15:12",
    disposition: "공급사 성적서 수령 및 ERP 첨부 완료",
  },
];

export const SCREEN_INVENTORY = [
  { label: "PageLayout", value: "공통", note: "표준 제목·액션·검색 프레임" },
  { label: "GridPanel", value: "CRUD", note: "조회·편집·마스터 상세" },
  { label: "FormGroup", value: "상태", note: "등록·상세·조건 입력" },
  { label: "Modal / Dialog", value: "중요", note: "조회 팝업·중요 액션 검토" },
  { label: "Tabs", value: "업무", note: "업무 상태·상세 문맥 전환" },
  { label: "Gantt", value: "현행", note: "스케줄·자원·공정 블록" },
];
