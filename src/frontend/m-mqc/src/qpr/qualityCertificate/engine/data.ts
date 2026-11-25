/**
 * 품질보증서 편집 — 목업(보증서 편집 시뮬레이터)의 고정 자료와 문서 모양. 보증 항목·변수·그림·조항·서명자·양식 선택 규칙·레이아웃 조절값.
 * 문서(WtyDoc)는 서버에 불투명한 JSON 문자열로 저장한다(계약 docs/mqc/demo/wty-contract.md §2).
 */

export type Lang = "ko" | "en";
export interface LText {
  ko: string;
  en: string;
}
export type Half = { t: "text"; c: LText } | { t: "image"; k: string };
export type TextBlock = { t: "text"; c: LText };
export type ImageBlock = { t: "image"; k: string; w?: number; al?: string; dy?: number };
export type TwoBlock = { t: "two"; ratio?: number; va?: string; L: Half; R: Half };
export type TableBlock = { t: "table"; head: boolean; rows: LText[][] };
export type Block = TextBlock | ImageBlock | TwoBlock | TableBlock;
export type BlockKind = Block["t"];

export interface Clause {
  id: string;
  on: boolean;
  b: Block[];
}

export interface WtyDoc {
  brand: string;
  lang: Lang;
  grade: string;
  signer: string;
  showLogo: boolean;
  showMark: boolean;
  logoSize: number;
  headerSide: "left" | "right";
  pinSign: boolean;
  clauses: Clause[];
  order: string[];
  vals: Record<string, Record<string, number | "">>;
  layout: Record<string, number>;
  assetImg: Record<string, string | null>;
  assetVer: Record<string, number>;
  sigImg: Record<string, string | null>;
  sigVer: Record<string, number>;
  sigH: number;
}

export const T = (ko: string, en: string): LText => ({ ko, en });
export const clone = <X>(o: X): X => JSON.parse(JSON.stringify(o)) as X;

export const BRANDS = ["LUXTEEL", "APPEAL", "UNICORE"];
export const GRADES = ["일반", "PREMIUM"];
export const LANGS: { value: Lang; label: string }[] = [
  { value: "ko", label: "한글" },
  { value: "en", label: "영문" },
];

export interface Item {
  cd: string;
  ko: string;
  en: string;
  u: string;
  ue: string;
  v: Record<string, number>;
}
export const ITEMS: Item[] = [
  { cd: "PERFORATION", ko: "천공 보증기간", en: "Perforation period", u: "년", ue: "years", v: { LUXTEEL: 10, APPEAL: 8, UNICORE: 5 } },
  { cd: "PEEL_FLAKE", ko: "박리 보증기간", en: "Peel/flake period", u: "년", ue: "years", v: { LUXTEEL: 10, APPEAL: 7, UNICORE: 5 } },
  { cd: "FADING_TERM", ko: "변색 보증기간", en: "Fading period", u: "년", ue: "years", v: { LUXTEEL: 5, APPEAL: 4, UNICORE: 3 } },
  { cd: "FADING_WALL", ko: "변색 허용범위(벽체)", en: "Fading limit (wall)", u: "ΔE", ue: "ΔE", v: { LUXTEEL: 5, APPEAL: 6, UNICORE: 7 } },
  { cd: "FADING_ROOF", ko: "변색 허용범위(지붕)", en: "Fading limit (roof)", u: "ΔE", ue: "ΔE", v: { LUXTEEL: 7, APPEAL: 8, UNICORE: 9 } },
  { cd: "CHALK_TERM", ko: "백화 보증기간", en: "Chalking period", u: "년", ue: "years", v: { LUXTEEL: 10, APPEAL: 8, UNICORE: 5 } },
  { cd: "CHALK_WALL", ko: "백화 허용범위(벽체)", en: "Chalking limit (wall)", u: "Rate", ue: "Rate", v: { LUXTEEL: 8, APPEAL: 7, UNICORE: 6 } },
  { cd: "CHALK_ROOF", ko: "백화 허용범위(지붕)", en: "Chalking limit (roof)", u: "Rate", ue: "Rate", v: { LUXTEEL: 6, APPEAL: 6, UNICORE: 5 } },
  { cd: "COAST_DIST", ko: "해안가 무보증 거리", en: "Coastal exclusion", u: "m", ue: "m", v: { LUXTEEL: 1000, APPEAL: 1000, UNICORE: 1500 } },
];

/** 블록 글에 쓰는 변수 이름 → 기준값 항목 코드. `브랜드명`·`적용지역` 은 따로 바꾼다. */
export const VARMAP: Record<string, string> = {
  천공보증기간: "PERFORATION",
  박리보증기간: "PEEL_FLAKE",
  변색보증기간: "FADING_TERM",
  변색벽체: "FADING_WALL",
  변색지붕: "FADING_ROOF",
  백화보증기간: "CHALK_TERM",
  백화벽체: "CHALK_WALL",
  백화지붕: "CHALK_ROOF",
  해안거리: "COAST_DIST",
};
export const VAR_NAMES = ["브랜드명", "적용지역", ...Object.keys(VARMAP)];

export interface Asset {
  nm: string;
  cap: LText;
  svg: string;
}
export const ASSETS: Record<string, Asset> = {
  측정도: {
    nm: "변색 측정 방법",
    cap: T("[그림] 노출면과 비노출면의 ΔE 비교", "[Fig.] ΔE comparison"),
    svg: `<svg viewBox="0 0 300 92" role="img" aria-label="색차 측정 도해">
   <rect x="6" y="18" width="92" height="52" rx="3" fill="#C9C2B4" stroke="#8C8578"/>
   <rect x="202" y="18" width="92" height="52" rx="3" fill="#6E8F8E" stroke="#3E5E5D"/>
   <path d="M104 44 H196" stroke="#17494A" stroke-width="1.5"/>
   <path d="M104 44 l8 -4 v8 z M196 44 l-8 -4 v8 z" fill="#17494A"/>
   <text x="150" y="36" text-anchor="middle" font-family="sans-serif" font-size="13" font-weight="700" fill="#17494A">ΔE</text>
   <text x="52" y="84" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#555049">노출면</text>
   <text x="248" y="84" text-anchor="middle" font-family="sans-serif" font-size="10" fill="#555049">비노출면</text></svg>`,
  },
  적용도: {
    nm: "적용 부위 구분",
    cap: T("[그림] 지붕·벽체 적용 부위", "[Fig.] Roof and wall areas"),
    svg: `<svg viewBox="0 0 260 110" role="img" aria-label="적용 부위 도해">
   <path d="M30 48 L130 10 L230 48 Z" fill="#6E8F8E" stroke="#3E5E5D" stroke-width="1.5"/>
   <rect x="52" y="48" width="156" height="50" fill="#D9D3C6" stroke="#8C8578" stroke-width="1.5"/>
   <rect x="110" y="68" width="40" height="30" fill="#FCFBF7" stroke="#8C8578"/>
   <path d="M196 30 H240" stroke="#17494A" stroke-width="1.2"/>
   <text x="244" y="33" font-family="sans-serif" font-size="10" font-weight="700" fill="#17494A">ROOF</text>
   <path d="M208 74 H236" stroke="#17494A" stroke-width="1.2"/>
   <text x="240" y="77" font-family="sans-serif" font-size="10" font-weight="700" fill="#17494A">WALL</text></svg>`,
  },
};
export const AKEYS = Object.keys(ASSETS);

export const MARK = `<svg viewBox="0 0 52 52" role="img" aria-label="품질 인증 마크" style="width:100%;height:auto">
 <circle cx="26" cy="26" r="24" fill="none" stroke="#17494A" stroke-width="2.5"/>
 <circle cx="26" cy="26" r="18" fill="none" stroke="#17494A" stroke-width="1"/>
 <path d="M17 27 l6 6 l12 -14" fill="none" stroke="#17494A" stroke-width="3" stroke-linecap="round" stroke-linejoin="round"/>
 <text x="26" y="47" text-anchor="middle" font-family="sans-serif" font-size="7" font-weight="700" fill="#17494A">QA</text></svg>`;

export interface ClauseMeta {
  id: string;
  lv: 0 | 1 | 2;
  t: string;
  b: Block[];
}
export const CLAUSES: ClauseMeta[] = [
  {
    id: "intro",
    lv: 0,
    t: "도입문",
    b: [
      {
        t: "text",
        c: T(
          "본 보증서는 동국씨엠㈜ {{브랜드명}} 제품에 대하여 출고일로부터 {{천공보증기간}}년 동안 유효하며, 아래 보증 항목이 적용됩니다.",
          "DONGKUK CM provides the following warranty concerning {{브랜드명}} for {{천공보증기간}} years from the date of shipment.",
        ),
      },
    ],
  },
  {
    id: "scope",
    lv: 1,
    t: "적용 범위",
    b: [
      {
        t: "text",
        c: T(
          "동국씨엠㈜는 하기 명기된 항목에 따라 {{적용지역}} 내 건축물에 적용된 {{브랜드명}}에 대하여 다음 기준으로 제품을 보증합니다. 효력은 출고일 또는 도장 공정 생산 후 6개월 중 먼저 도래하는 시점부터 발생합니다.",
          "DONGKUK CM warrants that {{브랜드명}} installed in {{적용지역}} will conform to the standards below. The period commences from shipment or six months from coating, whichever occurs first.",
        ),
      },
    ],
  },
  {
    id: "perf",
    lv: 2,
    t: "천공",
    b: [
      {
        t: "text",
        c: T(
          "{{브랜드명}}는 외부로부터의 손상이 없는 상태에서 {{천공보증기간}}년 동안 천공이 발생되지 않습니다.",
          "For {{천공보증기간}} years, {{브랜드명}} will not corrode to the point of perforation.",
        ),
      },
    ],
  },
  {
    id: "peel",
    lv: 2,
    t: "박리",
    b: [
      {
        t: "two",
        ratio: 38,
        L: { t: "image", k: "적용도" },
        R: {
          t: "text",
          c: T(
            "{{브랜드명}}는 외부로부터의 손상이 없는 상태에서 {{박리보증기간}}년 동안 도막이 벗겨지지 않습니다. 단, Roll-Forming 및 절단·절곡 작업 시 발생하는 미세한 균열은 포함되지 않습니다.",
            "For {{박리보증기간}} years, {{브랜드명}} will not peel or flake. Slight crazing at roll-formed edges is considered standard.",
          ),
        },
      },
    ],
  },
  {
    id: "fade",
    lv: 2,
    t: "변색",
    b: [
      { t: "image", k: "측정도", w: 250, al: "fl-right" },
      {
        t: "text",
        c: T(
          "{{브랜드명}}는 {{변색보증기간}}년 동안 벽체일 경우 ΔE가 {{변색벽체}} 이상, 지붕일 경우 ΔE가 {{변색지붕}} 이상 변하지 않습니다.",
          "For {{변색보증기간}} years, walls will not change more than {{변색벽체}} ΔE and roofs more than {{변색지붕}} ΔE.",
        ),
      },
      {
        t: "text",
        c: T(
          "단, 색상 변화는 외부오염을 제거한 표면에서 ASTM D2244-93 방법으로 측정합니다. 태양과 외부환경에 동등하게 노출되지 않은 표면은 균일하지 않을 수 있습니다.",
          "Color change is measured per ASTM D2244-93 on a surface cleaned of contamination. Surfaces not equally exposed may fade unevenly.",
        ),
      },
    ],
  },
  {
    id: "chalk",
    lv: 2,
    t: "백화",
    b: [
      {
        t: "text",
        c: T(
          "{{브랜드명}}는 {{백화보증기간}}년 동안 ASTM D4214 Method C로 측정 시 아래 기준보다 양호할 것을 보증합니다.",
          "For {{백화보증기간}} years, {{브랜드명}} will not chalk beyond the ratings below, measured per ASTM D4214 Method C.",
        ),
      },
      {
        t: "table",
        head: true,
        rows: [
          [T("적용 부위", "Area"), T("기준 Rate", "Rating")],
          [T("벽체", "Wall"), T("{{백화벽체}} 이상", "{{백화벽체}} or better")],
          [T("지붕", "Roof"), T("{{백화지붕}} 이상", "{{백화지붕}} or better")],
        ],
      },
    ],
  },
  {
    id: "coast",
    lv: 1,
    t: "해안가 제외",
    b: [
      {
        t: "text",
        c: T(
          "{{브랜드명}}는 해안가 또는 염수로부터 {{해안거리}}m 이상 떨어진 경우에만 보증합니다. 해당 범위 이내에 시공된 경우 보증 대상에서 제외됩니다.",
          "No warranty is provided for {{브랜드명}} installed within {{해안거리}} meters of a salt-water environment.",
        ),
      },
    ],
  },
  {
    id: "excl",
    lv: 1,
    t: "면책 — 환경",
    b: [
      {
        t: "text",
        c: T(
          "본 보증서는 동국씨엠㈜가 제어할 수 없는 환경, 즉 천재지변, 전쟁, 폭동, 낙하물, 외부압력, 유독가스, 화학물, 염분과다 대기, 동물의 배설물, 외부오염, 부적절한 취급과 저장 및 기타 가공에 의해 발생한 결함에는 적용되지 않습니다.",
          "This warranty excludes failures caused by acts of God, war, falling objects, corrosive gases, salt-laden atmospheres, animal waste, surface contamination, or improper handling and fabrication.",
        ),
      },
    ],
  },
  {
    id: "trans",
    lv: 1,
    t: "면책 — 운송·보관",
    b: [
      {
        t: "text",
        c: T("부적절한 운송이나 보관, 가공으로 인해 발생하는 문제는 보증에서 제외됩니다.", "Problems arising from improper transport, storage or fabrication are excluded."),
      },
    ],
  },
  {
    id: "color",
    lv: 1,
    t: "색상 범위",
    b: [
      {
        t: "text",
        c: T(
          "본 보증서는 동국씨엠㈜에서 승인된 색상 범위에서만 적용됩니다. 일부 색상은 표준에 맞지 않을 수 있으며, 이 경우 제조사와 별도 협의를 거칩니다.",
          "This warranty applies only to colors within DONGKUK CM's approved range.",
        ),
      },
    ],
  },
];
export const meta = (id: string) => CLAUSES.find((c) => c.id === id);

export interface Signer {
  id: string;
  ko: string;
  en: string;
  tk: string;
  te: string;
  from: string;
}
export const SIGNERS: Signer[] = [
  { id: "S2", ko: "변○○", en: "B. H. Byun", tk: "품질기획팀장", te: "Quality Planning Team Leader", from: "2026-02" },
  { id: "S1", ko: "이○○", en: "K. H. Lee", tk: "품질기획팀장", te: "Quality Planning Team Leader", from: "2025-07" },
  { id: "S0", ko: "최○○", en: "I. S. Choi", tk: "품질관리팀장", te: "Quality Control Team Leader", from: "2023-01" },
];
export const signerOf = (id: string) => SIGNERS.find((x) => x.id === id) ?? SIGNERS[0];

export interface FormRule {
  b: string;
  l: string;
  g: string;
  tpl: string;
  p: number;
}
/** 양식 선택 규칙 — 우선(p) 이 작은 것부터 보고 먼저 걸리는 규칙을 쓴다. `*` 는 아무 값. */
export const RULES: FormRule[] = [
  { b: "LUXTEEL", l: "en", g: "PREMIUM", tpl: "럭스틸 프리미엄 영문", p: 10 },
  { b: "LUXTEEL", l: "ko", g: "*", tpl: "럭스틸 한글", p: 20 },
  { b: "*", l: "en", g: "PREMIUM", tpl: "표준 프리미엄 영문", p: 90 },
  { b: "*", l: "*", g: "*", tpl: "표준 기본 양식", p: 999 },
];

export interface SliderDef {
  k: string;
  ko: string;
  min: number;
  max: number;
  step: number;
  def: number;
  u: string;
}
export const SLIDERS: SliderDef[] = [
  { k: "fontSize", ko: "본문 글자 크기", min: 9, max: 15, step: 0.5, def: 11.5, u: "pt" },
  { k: "lineHeight", ko: "줄 간격", min: 1.3, max: 2.2, step: 0.05, def: 1.7, u: "배" },
  { k: "gap", ko: "조항 간 간격", min: 2, max: 16, step: 0.5, def: 6, u: "mm" },
  { k: "margin", ko: "상하좌우 여백", min: 10, max: 30, step: 1, def: 17, u: "mm" },
];

export const ALIGNS: [value: string, label: string][] = [
  ["center", "가운데"],
  ["left", "왼쪽"],
  ["right", "오른쪽"],
  ["fl-left", "글이 감싸며 흐름 — 왼쪽"],
  ["fl-right", "글이 감싸며 흐름 — 오른쪽"],
];

export const KIND: Record<BlockKind, string> = { text: "문단", image: "그림", two: "2단", table: "표" };

/** mm → px(96dpi), A4 한 쪽 높이(px), 기준 쪽수. */
export const MM = 3.7795;
export const PAGE_H = 1123;
export const PAPER_W = 794;
export const BASE_PAGES = 2;

/** 기본 문서(목업 DEF). 서버에 문서가 없으면 이것으로 INIT 한다. */
export function DEF(): WtyDoc {
  return {
    brand: "LUXTEEL",
    lang: "ko",
    grade: "일반",
    signer: "S2",
    showLogo: true,
    showMark: false,
    logoSize: 17,
    headerSide: "right",
    pinSign: true,
    clauses: CLAUSES.map((c) => ({ id: c.id, on: true, b: clone(c.b) })),
    order: CLAUSES.map((c) => c.id),
    vals: Object.fromEntries(ITEMS.map((i) => [i.cd, { ...i.v }])),
    layout: Object.fromEntries(SLIDERS.map((s) => [s.k, s.def])),
    assetImg: Object.fromEntries(AKEYS.map((k) => [k, null])),
    assetVer: Object.fromEntries(AKEYS.map((k) => [k, 1])),
    sigImg: Object.fromEntries(SIGNERS.map((x) => [x.id, null])),
    sigVer: Object.fromEntries(SIGNERS.map((x) => [x.id, 1])),
    sigH: 44,
  };
}

/** 서버 본문 → 문서. 빠진 칸은 기본값으로 채운다(옛 본문·손상 대비). */
export function parseDoc(json: string | null | undefined): WtyDoc | null {
  if (!json) return null;
  try {
    const o = JSON.parse(json) as Partial<WtyDoc>;
    if (!o || !Array.isArray(o.clauses) || !Array.isArray(o.order)) return null;
    return { ...DEF(), ...o } as WtyDoc;
  } catch {
    return null;
  }
}
