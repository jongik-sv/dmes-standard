/**
 * 샘플 전문 한 줄 표시(TSK-05-03 design.md §2·§6.8 — html render() 규칙). 바이트 구간은 서버(execute)가 인코딩 바이트로 만든다 —
 * 화면은 그 구간을 색·가운뎃점·눈금자로 보일 뿐 길이를 다시 세지 않는다(불변 I2).
 */

export interface SegmentZone {
  ZONE: string;
  HEADER_SEQ: number;
  FILL_KIND: string;
}

export interface SegmentLabel {
  ZONE: string;
  ZONE_LABEL?: string | null;
  NAME?: string | null;
  OFFSET: number;
  LENGTH: number;
}

/** html 4색 — 첫 헤더·둘째 헤더·본문 DATA·FILLER. 셋째 헤더부터는 앞 두 헤더 색을 돌려 쓴다. */
export const ZONE_COLORS: Record<string, string> = { h1: "#dbeafe", h2: "#fef3c7", body: "#dcfce7", filler: "#e5e7eb" };

export const ZONE_LEGEND: Array<{ key: string; label: string }> = [
  { key: "h1", label: "첫째 헤더" }, { key: "h2", label: "둘째 헤더" }, { key: "body", label: "본문" }, { key: "filler", label: "FILLER" },
];

/** 공백을 가운뎃점으로 — 칸 채움이 보이게. */
export function visibleText(text: string): string {
  return text.replace(/ /g, "·");
}

/** 1부터 센 위치 — 10의 배수는 십의 자리 숫자, 5의 배수는 +, 나머지 . */
export function ruler(total: number): string {
  let out = "";
  for (let i = 1; i <= total; i++) out += i % 10 === 0 ? String((i / 10) % 10) : i % 5 === 0 ? "+" : ".";
  return out;
}

export function zoneKey(seg: SegmentZone): string {
  if (seg.FILL_KIND === "FILLER") return "filler";
  return seg.ZONE === "HEADER" ? `h${seg.HEADER_SEQ}` : "body";
}

export function zoneColor(key: string): string {
  const m = /^h(\d+)$/.exec(key);
  if (m) return ZONE_COLORS[Number(m[1]) % 2 === 1 ? "h1" : "h2"];
  return ZONE_COLORS[key] ?? ZONE_COLORS.body;
}

/** 1부터 센 위치 — 길이 1 이면 한 숫자. */
export function position(offset: number, length: number): string {
  return length === 1 ? String(offset + 1) : `${offset + 1}-${offset + length}`;
}

/** "{구역} {이름} {위치}" — 마우스를 올리면 보이는 제목. */
export function segmentTitle(seg: SegmentLabel): string {
  const zone = seg.ZONE === "BODY" ? "본문" : seg.ZONE_LABEL ?? "헤더";
  return `${zone} ${seg.NAME ?? ""} ${position(seg.OFFSET, seg.LENGTH)}`;
}
