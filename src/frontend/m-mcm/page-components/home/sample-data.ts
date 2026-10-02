/**
 * ★ 포털 홈 샘플 데이터 — 화면 시안(2026-10-02 사용자 승인)의 숫자를 그대로 옮긴 것이다. 실제 집계가 아니다.
 *
 * KPI·차트·작업지시·설비 알람·출하 예정·내 알림은 아직 연결할 서비스가 없어 이 파일의 상수로 그린다.
 * 실제 데이터로 바꿀 때는 이 파일의 상수를 api.ts 의 조회 결과로 바꾸면 된다(모양은 아래 타입을 따른다).
 * 화면은 인사말 줄에 "지표·차트·표는 샘플 데이터" 를, 내 알림 카드에 "구현 예정" 을 표시한다.
 */
import type { BadgeTone } from "@dk-oasis/shared/form";

/* ── 교대조(샘플) ── */
export interface ShiftDef {
  code: string;
  label: string;
  /** 시작 시각(시). */
  from: number;
  /** 끝 시각(시, 다음 날이면 24 이상). */
  to: number;
}

export const SHIFTS: ShiftDef[] = [
  { code: "A", label: "A조 (06–14시)", from: 6, to: 14 },
  { code: "B", label: "B조 (14–22시)", from: 14, to: 22 },
  { code: "C", label: "C조 (22–06시)", from: 22, to: 30 },
];

/** 지금 시각의 교대조 이름(예: "주간 A조"). */
export function currentShiftLabel(hour: number): string {
  if (hour >= 6 && hour < 14) return "주간 A조";
  if (hour >= 14 && hour < 22) return "오후 B조";
  return "야간 C조";
}

/* ── 제품군 선택(지금은 표시만) ── */
export const PRODUCT_GROUPS = ["전체", "냉연", "도금", "컬러"];

/* ── KPI 6개 ── */
export interface SampleKpi {
  key: string;
  label: string;
  value: number;
  unit: string;
  /** 계획(또는 목표) 값. */
  plan: number;
  /** 전일 대비 증감 문구. */
  delta: string;
  /** 증감이 좋은 쪽인지. */
  good: boolean;
  /** 최근 7일 추이. */
  trend: number[];
  /** 주의 표시. */
  warn?: boolean;
  /** 낮을수록 좋은 지표(목표 ≤). */
  lowerBetter?: boolean;
}

export const SAMPLE_KPIS: SampleKpi[] = [
  {
    key: "pltcm",
    label: "냉연 생산 (PLTCM)",
    value: 5860,
    unit: "t",
    plan: 6000,
    delta: "+1.4%",
    good: true,
    trend: [5.62, 5.71, 5.8, 5.66, 5.9, 5.78, 5.86],
  },
  {
    key: "cgl",
    label: "도금 생산 (CGL)",
    value: 3420,
    unit: "t",
    plan: 3500,
    delta: "+0.6%",
    good: true,
    trend: [3.31, 3.36, 3.4, 3.28, 3.44, 3.4, 3.42],
  },
  {
    key: "ccl",
    label: "컬러 생산 (CCL)",
    value: 1180,
    unit: "t",
    plan: 1150,
    delta: "+3.1%",
    good: true,
    trend: [1.08, 1.12, 1.1, 1.15, 1.13, 1.14, 1.18],
  },
  {
    key: "ship",
    label: "제품 출하",
    value: 9240,
    unit: "t",
    plan: 9500,
    delta: "-2.3%",
    good: false,
    trend: [9.6, 9.4, 9.7, 9.3, 9.5, 9.46, 9.24],
    warn: true,
  },
  {
    key: "yield",
    label: "실수율",
    value: 94.6,
    unit: "%",
    plan: 95,
    delta: "-0.2%p",
    good: false,
    trend: [95.1, 94.9, 95.2, 94.8, 94.9, 94.8, 94.6],
    warn: true,
  },
  {
    key: "defect",
    label: "품질 불량률",
    value: 0.38,
    unit: "%",
    plan: 0.45,
    delta: "-0.04%p",
    good: true,
    trend: [0.46, 0.44, 0.43, 0.45, 0.41, 0.42, 0.38],
    lowerBetter: true,
  },
];

/* ── 월별 생산 실적(천 t) — 9월까지 실적, 10~12월은 전망 ── */
export const MONTHS = [
  "1월",
  "2월",
  "3월",
  "4월",
  "5월",
  "6월",
  "7월",
  "8월",
  "9월",
  "10월",
  "11월",
  "12월",
];
export const MONTHLY_COLD = [112, 101, 118, 115, 121, 114, 108, 103, 117, 116, 113, 104];
export const MONTHLY_COATED = [96, 88, 101, 99, 104, 98, 95, 90, 102, 100, 97, 90];
export const MONTHLY_COLOR = [34, 30, 36, 35, 37, 35, 33, 31, 36, 35, 34, 30];
export const MONTHLY_PLAN = [245, 220, 250, 250, 260, 248, 238, 225, 252, 252, 245, 225];
/** 마지막 실적 달의 순번(0부터) — 9월. */
export const MONTHLY_LAST_ACTUAL = 8;

/* ── 설비 가동 상태(전체 14개 라인) ── */
export const EQUIPMENT_STATUS = [
  { label: "가동", value: 11, color: "var(--color-chart-3)" },
  { label: "대기", value: 1, color: "var(--color-chart-1)" },
  { label: "계획정비", value: 1, color: "var(--color-chart-5)" },
  { label: "고장", value: 1, color: "var(--color-danger)" },
];

/* ── 공정별 금일 생산(t, 교대조별) ── */
export const PROCESS_OUTPUT = [
  { label: "산세(PL)", A: 2100, B: 2050, C: 1700 },
  { label: "냉간압연(TCM)", A: 2020, B: 1980, C: 1650 },
  { label: "소둔(CAL)", A: 820, B: 800, C: 640 },
  { label: "도금(CGL)", A: 1180, B: 1150, C: 1090 },
  { label: "컬러(CCL)", A: 410, B: 400, C: 370 },
  { label: "정정(SL)", A: 960, B: 920, C: 780 },
];

/* ── 불량 유형(이번 주, 건) ── */
export const DEFECT_TYPES = [
  { label: "스크래치", value: 34 },
  { label: "도금 드로스", value: 22 },
  { label: "색차", value: 16 },
  { label: "두께 편차", value: 12 },
  { label: "오일 얼룩", value: 8 },
  { label: "핀홀", value: 6 },
];

/* ── 금일 작업지시 ── */
export type WorkOrderStatus = "완료" | "진행" | "대기" | "지연";

export interface WorkOrderRow {
  woNo: string;
  process: string;
  steel: string;
  spec: string;
  orderQty: number;
  doneQty: number;
  progress: number;
  status: WorkOrderStatus;
}

const WO_RAW: Array<[string, string, string, string, number, number, WorkOrderStatus]> = [
  ["WO-261002-0104", "냉간압연(TCM)", "SPCC", "0.8t × 1,219w", 620, 620, "완료"],
  ["WO-261002-0108", "도금(CGL)", "SGCC Z120", "0.5t × 1,219w", 480, 355, "진행"],
  ["WO-261002-0111", "도금(CGL)", "SGLC AZ150", "0.45t × 914w", 360, 120, "진행"],
  ["WO-261002-0115", "컬러(CCL)", "PCM-PE 화이트", "0.5t × 1,219w", 210, 96, "진행"],
  ["WO-261002-0120", "소둔(CAL)", "SPCD", "1.0t × 1,250w", 540, 0, "대기"],
  ["WO-261002-0123", "컬러(CCL)", "PCM-HPP 메탈릭", "0.6t × 1,219w", 180, 40, "지연"],
];

export const SAMPLE_WORK_ORDERS: WorkOrderRow[] = WO_RAW.map(
  ([woNo, process, steel, spec, orderQty, doneQty, status]) => ({
    woNo,
    process,
    steel,
    spec,
    orderQty,
    doneQty,
    progress: orderQty > 0 ? Math.round((doneQty / orderQty) * 100) : 0,
    status,
  })
);

/** 작업지시 카드 부제 — 시안 문구 그대로(전체 14건은 샘플 숫자). */
export const WORK_ORDER_SUMMARY = "진행 중 6건 / 전체 14건";

export const WORK_ORDER_STATUS_TONE: Record<WorkOrderStatus, BadgeTone> = {
  완료: "success",
  진행: "primary",
  대기: "neutral",
  지연: "danger",
};

/* ── 설비 알람(최근 24시간) ── */
export type AlarmSeverity = "critical" | "warning" | "info";

export interface AlarmRow {
  id: string;
  severity: AlarmSeverity;
  title: string;
  detail: string;
  time: string;
}

export const SAMPLE_ALARMS: AlarmRow[] = [
  {
    id: "a1",
    severity: "critical",
    title: "CGL #2 아연 포트 온도 하한 이탈",
    detail: "도금 · 452℃ (기준 455~465℃)",
    time: "09:42",
  },
  {
    id: "a2",
    severity: "critical",
    title: "CCL #1 오븐 3존 온도 편차",
    detail: "컬러 · 설정 대비 +12℃",
    time: "08:15",
  },
  {
    id: "a3",
    severity: "warning",
    title: "TCM 4스탠드 작업롤 교체 주기 도래",
    detail: "냉간압연 · 누적 3,820t / 4,000t",
    time: "07:30",
  },
  {
    id: "a4",
    severity: "warning",
    title: "산세 #1 탱크 염산 농도 저하",
    detail: "산세 · 142 g/L (기준 150 이상)",
    time: "06:05",
  },
  {
    id: "a5",
    severity: "warning",
    title: "CGL #1 에어나이프 압력 변동",
    detail: "도금 · 부착량 편차 ±6 g/m²",
    time: "03:48",
  },
  { id: "a6", severity: "info", title: "슬리터 #2 정기점검 완료", detail: "정정", time: "01:20" },
];

export const ALARM_SEVERITY: Record<AlarmSeverity, { label: string; tone: BadgeTone }> = {
  critical: { label: "위험", tone: "danger" },
  warning: { label: "주의", tone: "warning" },
  info: { label: "정보", tone: "primary" },
};

/* ── 출하 예정(D+0 ~ D+2) ── */
export type ShipmentStatus = "상차완료" | "상차중" | "대기" | "재고부족";

export interface ShipmentRow {
  id: string;
  shipDate: string;
  customer: string;
  item: string;
  qty: number;
  status: ShipmentStatus;
}

export const SAMPLE_SHIPMENTS: ShipmentRow[] = [
  {
    id: "s1",
    shipDate: "10-02",
    customer: "가전 A사",
    item: "컬러강판 PCM",
    qty: 420,
    status: "상차완료",
  },
  {
    id: "s2",
    shipDate: "10-02",
    customer: "건자재 B사",
    item: "도금 GL AZ150",
    qty: 680,
    status: "상차중",
  },
  {
    id: "s3",
    shipDate: "10-05",
    customer: "자동차부품 C사",
    item: "냉연 SPCC",
    qty: 1150,
    status: "대기",
  },
  {
    id: "s4",
    shipDate: "10-05",
    customer: "강관 D사",
    item: "도금 GI Z120",
    qty: 930,
    status: "재고부족",
  },
  {
    id: "s5",
    shipDate: "10-06",
    customer: "수출(동남아)",
    item: "냉연 SPCD",
    qty: 1600,
    status: "대기",
  },
];

export const SHIPMENT_STATUS_TONE: Record<ShipmentStatus, BadgeTone> = {
  상차완료: "success",
  상차중: "primary",
  대기: "neutral",
  재고부족: "warning",
};

/* ── 내 알림(알림 기능 구현 예정 — 화면 안 상태로만 읽음 처리) ── */
export type NotificationType = "결재" | "품질" | "작업" | "공지" | "멘션" | "시스템";

export interface SampleNotification {
  id: number;
  type: NotificationType;
  title: string;
  sub: string;
  time: string;
  unread: boolean;
  /** 공지 알림 — 누르면 홈 공지 카드에서 긴급 공지(없으면 첫 공지)를 고른다. 샘플이라 실제 공지 ID 와 잇지 않는다. */
  opensNotice?: boolean;
}

export const SAMPLE_NOTIFICATIONS: SampleNotification[] = [
  {
    id: 1,
    type: "결재",
    title: "작업지시 납기 변경 승인 요청",
    sub: "WO-261002-0123 컬러(CCL) · 요청자 김민수",
    time: "10분 전",
    unread: true,
  },
  {
    id: 2,
    type: "품질",
    title: "색차 ΔE 기준 초과 코일 발생",
    sub: "CCL #1 · 코일 C2610020457 · ΔE 1.8 (기준 1.2 이하)",
    time: "32분 전",
    unread: true,
  },
  {
    id: 3,
    type: "작업",
    title: "작업지시 3건이 배정되었습니다",
    sub: "도금(CGL) #2 · 주간 A조",
    time: "1시간 전",
    unread: true,
  },
  {
    id: 4,
    type: "공지",
    title: "새 공지: 10/4(일) MES 서버 정기 점검 안내",
    sub: "정보시스템팀",
    time: "어제 17:20",
    unread: true,
    opensNotice: true,
  },
  {
    id: 5,
    type: "품질",
    title: "도금 부착량 편차 재검사 결과 등록",
    sub: "CGL #1 · 코일 G2610010211 · 합격",
    time: "어제 16:05",
    unread: false,
  },
  {
    id: 6,
    type: "멘션",
    title: "이영희 님이 작업 메모에서 나를 언급했습니다",
    sub: '"TCM 4스탠드 롤 교체 일정 확인 부탁드립니다"',
    time: "어제 15:02",
    unread: false,
  },
  {
    id: 7,
    type: "결재",
    title: "설비 정비 요청이 승인되었습니다",
    sub: "TCM 4스탠드 작업롤 교체 · 승인자 박정호",
    time: "어제 11:40",
    unread: false,
  },
  {
    id: 8,
    type: "시스템",
    title: "비밀번호 변경일이 7일 남았습니다",
    sub: "10/9(금)까지 변경하세요",
    time: "9월 30일",
    unread: false,
  },
];

/** 알림 종류 아이콘(글자)·색. */
export const NOTIFICATION_ICON: Record<NotificationType, { text: string; tone: BadgeTone }> = {
  결재: { text: "결", tone: "primary" },
  품질: { text: "품", tone: "danger" },
  작업: { text: "작", tone: "success" },
  공지: { text: "공", tone: "warning" },
  멘션: { text: "@", tone: "neutral" },
  시스템: { text: "시", tone: "neutral" },
};

export type NotificationFilter = "all" | "unread" | "결재" | "작업" | "품질" | "공지";

export const NOTIFICATION_FILTERS: Array<{ value: NotificationFilter; label: string }> = [
  { value: "all", label: "전체" },
  { value: "unread", label: "안읽음" },
  { value: "결재", label: "결재" },
  { value: "작업", label: "작업" },
  { value: "품질", label: "품질" },
  { value: "공지", label: "공지" },
];

export function filterNotifications(
  list: SampleNotification[],
  filter: NotificationFilter
): SampleNotification[] {
  if (filter === "all") return list;
  if (filter === "unread") return list.filter((n) => n.unread);
  return list.filter((n) => n.type === filter);
}
