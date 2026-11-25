/** Tag관리 고정값 — 목업과 같은 값(용지 크기 · 장비 한계 · 칸 이름 · 출처 이름 · 소관). */

/** LABEL_PAGE_FORMAT_PRD 348 × 667pt, REVERSE_LANDSCAPE 로 찍혀 가로 667. */
export const PAGE = { w: 667, h: 348 };
export const PT_MM = 25.4 / 72;
export const PX_MM = 96 / 25.4;
export const PX_PT = PT_MM * PX_MM;
export const SIZES = [
  { id: "std", nm: "표준", fx: 1, fy: 1 },
  { id: "h15", nm: "가로 1.5배", fx: 1.5, fy: 1 },
  { id: "h2", nm: "가로 2배", fx: 2, fy: 1 },
  { id: "v15", nm: "세로 1.5배", fx: 1, fy: 1.5 },
  { id: "v2", nm: "세로 2배", fx: 1, fy: 2 },
];
/** ZT421 · ZT420 최대 인쇄 폭 / 8인치급 / 300dpi 최대 인쇄 길이(mm, 제조사 사양). */
export const HEAD6 = 168;
export const HEAD8 = 216;
export const MAXLEN = 1854;

export type Src = "cus" | "disp" | "show" | "fact" | "else" | "none" | "title";
export const SRC_NM: Record<string, string> = {
  cus: "고객 요청",
  disp: "인증 · 규격",
  show: "표시 규칙",
  fact: "MES 코일 정보",
  else: "기본값",
  none: "값 없음",
  title: "양식 글자",
};
/** TAG 위 출처 색칠(종이 그림 색 — 화면 테마와 무관하게 같은 색으로 찍는다). */
export const SRC_FILL: Record<string, string> = { cus: "#B48CE0", disp: "#3FB3AE", show: "#E0A44A", fact: "#7FA3D6", else: "#B7BFC6" };
/** 출처 → 배지 색. */
export const SRC_TONE: Record<string, "primary" | "success" | "warning" | "danger" | "neutral"> = {
  cus: "danger",
  disp: "success",
  show: "warning",
  fact: "primary",
  else: "neutral",
  none: "neutral",
  title: "neutral",
};

/** 칸 이름 — 현업이 TAG 에서 부르는 말. */
export const LBL: Record<string, string> = {
  CMDTY: "품명(영문)", CMDTY2: "품명 둘째 줄", CMDTY_ENG: "품명(영문, 국내 양식)", MRK_PRD_NM: "표시 품명", STD_MRK: "국내 규격 마크(KS · JIS)", STD_MRK_BIS: "BIS 마크",
  STD_MRK_DESC_BIS: "BIS 인증번호", STD_MRK_DESC_BIS_UP: "BIS 규격 표기", STD_MRK_TISI: "TISI 마크", STD_MRK_DESC_TISI: "TISI 규격 표기", QR_CODE: "QR(인증 · 앱 링크)", STD_MRK_SIRIM_EGI: "SIRIM 마크",
  SPC: "규격(SPEC)", SPC_LAMINA: "규격(Lamina)", APL_SPC: "적용 규격", STD_NO: "규격번호", STD_MRK_DESC: "규격 설명", HEAT_NO_TTL: "Heat No 제목", HEAT_NO: "Heat No", BR_NM: "브랜드 로고", CMP_LOGO: "회사 로고",
  BIS_LINK1: "BIS 안내 1줄", BIS_LINK2: "BIS 안내 2줄", BIS_LINK3: "BIS 안내 3줄", PO_NO: "주문번호(P/O)", PO_NO2: "수입자 표기", DEST: "목적지", SIZ: "치수", NWGT: "순중량", GWGT: "총중량", WGT: "중량",
  WGT_TTL: "중량 단위", WGT_UNT: "중량 단위", NET_WGT_KG: "순중량(kg)", GRS_WGT_KG: "총중량(kg)", LTH_SHT: "길이 · 매수", LTH_SHT_UNT: "길이 · 매수 단위", LTH_METER: "길이(m)", COIL_NO: "코일번호(작게)",
  COIL_ID: "코일번호", BARCD: "바코드", PAK_MTH: "포장", MAN_DD: "제조일", MADEIN: "원산지", PRT_NO: "Part No", CSM_CLR: "고객 색상", COATG: "부착량", COATG_TTL: "부착량 제목", COLOR: "색상",
  COLOR_TTL: "색상 제목", COLOR_TOP: "앞면 색상", COLOR_TOP_TTL: "앞면 색상 제목", COLOR_BAK: "뒷면 색상", COLOR_BAK_TTL: "뒷면 색상 제목", STL_KND: "강종", DMDP: "수요가", USG: "용도", GRD: "등급",
  PRD_CD: "제품코드", INSR: "검사자", ROHS: "RoHS 표기", ADD_PRD_NM: "추가 품명", ADD_MADEIN_ADR: "원산지 주소", SAMPLE_MSG: "샘플 문구", MIX_YN: "혼용방지 표시", STAR_SYM: "별 기호", EMBS: "EMBOSS 표기",
  RSN_TP_FRN: "수지 구분", COIL_ODIA: "코일 외경", MIX_WTH_EXP: "동일폭 개수", RMTL_MAK_ENG: "원자재 공급사", PVDF: "PVDF 표기",
};
export const STD_F: Record<string, string> = { SHORT: "짧은 표기", FULL: "전체 표기", T1: "영문 품명 1", T2: "영문 품명 2", DISP: "표시 품명" };
export const LIC_F: Record<string, string> = { NO: "번호", MARK: "마크", QR: "QR · URL", TO: "만료일" };

/** 소관은 값의 출처로 정한다: 인증 · 규격 = 품질, 고객 요청 = 영업, 규칙 표 밖(기본값 · 아직 옮기지 않은 규칙) = 생산 · IT. */
export const ROLES: [string, string][] = [
  ["all", "전체"],
  ["qa", "품질"],
  ["sales", "영업"],
  ["it", "생산 · IT"],
];
export const OWNER: Record<string, string> = { disp: "qa", cus: "sales", else: "it", none: "it" };
export const roleNm = (r: string) => (ROLES.find((x) => x[0] === r) || ROLES[0])[1];

export const FAMS = ["제품 TAG", "서비스카드", "검사표", "색상 TAG", "시편 · 샘플", "KISS 컷팅", "가TAG · 위치표 · 기타", "고객 전용"];
export const VERD: [string, string][] = [
  ["need", "옮겨야 함"],
  ["ok", "바뀌어도 됨"],
  ["hold", "보류"],
];
export const KIND_NM: Record<string, string> = { data: "글자", image: "그림", barcode: "바코드", qrcode: "QR" };
export const FMF: [string, string][] = [
  ["all", "전체"],
  ["cond", "조건 따라"],
  ["gap", "안 옮긴 규칙"],
  ["chk", "확인 필요"],
  ["clash", "겹침"],
  ["same", "늘 같음"],
];
export const STDMRK_IMG: Record<string, string> = { KS: "std_ks.jpg", JIS: "std_jis.jpg", MS: "std_sirim.jpg" };
export const FACT_NAMES = new Set([
  "COIL_ID", "COIL_NO", "BARCD", "SIZ", "WGT", "NWGT", "GWGT", "WGT_TTL", "WGT_UNT", "LTH_SHT", "LTH_SHT_UNT", "MAN_DD", "PRD_CD", "GRD", "STL_KND", "CMDTY", "CMDTY2", "CMDTY_ENG",
  "STD_MRK_DESC", "COLOR_TTL", "COLOR", "COLOR_TOP", "COLOR_TOP_TTL", "COLOR_BAK_TTL", "COLOR_BAK", "COATG_TTL", "COATG", "INSR", "USG", "PAK_MTH", "DMDP", "DEST", "PO_NO", "MADEIN", "PRT_NO",
  "RSN_TP_FRN", "EMBS", "MIX_WTH_EXP", "MIX_YN", "STAR_SYM", "CSM_CLR", "COIL_ODIA", "PVDF", "RMTL_MAK_ENG",
]);
export const ORDER_KEYS = new Set(["DEST", "PO_NO", "DMDP"]);
/** 칸 목록 「언제 찍히나」 종류 → 이름 · 배지 색. */
export const WK_TONE: Record<string, "primary" | "success" | "warning" | "danger" | "neutral"> = {
  rule: "success",
  gap: "danger",
  chk: "warning",
  tpl: "neutral",
  fact: "primary",
  fixed: "neutral",
  none: "neutral",
};
export const MIG_TONE: Record<string, "primary" | "success" | "warning" | "danger" | "neutral"> = {
  moved: "success",
  same: "success",
  gap: "danger",
  fact: "primary",
  tpl: "neutral",
  chk: "warning",
  drop: "neutral",
};
