/**
 * 종이 그리기 — 목업 app.html 의 qrUrl·sumLines·gridHtml·colorHtml·paperHtml 을 옮겼다(현행 양식 배치 그대로).
 * 그림은 호출하는 쪽이 넘긴다: `imgs` = 종이 위 고정 그림(로고·마크), `imgSrc(name)` = 서명·도장 등록함 그림.
 * 위변조방지(목업 수준): `verify` 를 주면 QR 을 진위 확인 번호로 그리고 하단에 번호·해시를, 배경에 보안 무늬를 넣는다.
 */
import { FORMDEF } from "./formdef";
import { esc, textToHtml } from "./text";
import type { Snap } from "./types";

export const BLANK = "data:image/gif;base64,R0lGODlhAQABAAAAACH5BAEKAAEALAAAAAABAAEAAAICTAEAOw==";

/** QR 모양(시연용 — 실제 QR 인코딩이 아니다). 같은 seed 면 같은 그림. */
export function qrUrl(seed: string) {
  let h = 0;
  for (const ch of seed) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const n = 25;
  let cells = "";
  const fin = (x: number, y: number) =>
    `<rect x="${x}" y="${y}" width="7" height="7"/><rect x="${x + 1}" y="${y + 1}" width="5" height="5" fill="#fff"/><rect x="${x + 2}" y="${y + 2}" width="3" height="3"/>`;
  for (let y = 0; y < n; y++)
    for (let x = 0; x < n; x++) {
      if ((x < 8 && y < 8) || (x > 16 && y < 8) || (x < 8 && y > 16)) continue;
      h = (h * 1103515245 + 12345) >>> 0;
      if ((h >>> 16) & 1) cells += `<rect x="${x}" y="${y}" width="1" height="1"/>`;
    }
  return (
    "data:image/svg+xml;utf8," +
    encodeURIComponent(
      `<svg xmlns="http://www.w3.org/2000/svg" viewBox="-2 -2 ${n + 4} ${n + 4}" shape-rendering="crispEdges"><rect x="-2" y="-2" width="${n + 4}" height="${n + 4}" fill="#fff"/>${fin(0, 0)}${fin(18, 0)}${fin(0, 18)}${cells}</svg>`,
    )
  );
}

/** 줄별 합계(1,234 형식). first 면 첫 줄만. */
export function sumLines(vals: unknown[], first?: boolean) {
  const parts = vals.map((v) =>
    String(v || "")
      .split("\n")
      .map((x) => +x.replace(/,/g, "") || 0),
  );
  const m = first ? 1 : Math.max(...parts.map((p) => p.length));
  return Array.from({ length: m }, (_, i) => parts.reduce((a, p) => a + (p[i] || 0), 0).toLocaleString("en-US")).join("\n");
}

export interface PaperOpt {
  /** 양식 초안에서 바뀐 곳(문구 키 · `col.<칸>`). */
  chg?: Set<string> | null;
  draft?: boolean;
  copy?: "원본" | "사본";
  /** 발행본의 진위 확인 번호·문서 해시(발행된 건만). */
  verify?: { code: string; hash: string } | null;
}

export function gridHtml(R: Snap, opt: PaperOpt) {
  const D = FORMDEF[R.fk];
  const L = R.cols;
  const n = L.length;
  const sc = 281.042 / L.reduce((a, c) => a + D.leaf[c.k].w, 0);
  const W = L.map((c) => D.leaf[c.k].w * sc);
  const chg = opt.chg || new Set<string>();
  let h = `<table class="grid" style="width:281.042mm;"><colgroup>${W.map((w) => `<col style="width:${w.toFixed(3)}mm"/>`).join("")}</colgroup><thead>`;
  for (let r = 0; r < D.heights.length; r++) {
    h += `<tr style="height:${D.heights[r]}mm;">`;
    for (let i = 0; i < n; ) {
      const cid = D.leaf[L[i].k].occ[r];
      const cell = D.cells[cid];
      let j = i + 1;
      while (j < n && D.leaf[L[j].k].occ[r] === cid) j++;
      if (cell.r === r) {
        let inner: string;
        let at = "";
        if (D.leaf[L[i].k].top === cid) {
          inner = textToHtml(L[i].l);
          if (L[i].s) at += ` data-o="${L[i].s}"${L[i].w ? ` title="예외 규칙 ${esc(L[i].w)}"` : ""}`;
          if (chg.has("col." + L[i].k)) at += " data-chg";
        } else {
          const ov = R.cellOv[cid];
          inner = ov ? ov.t : cell.t;
          if (ov) at += ` data-o="${ov.s}" title="예외 규칙 ${esc(ov.w)}"`;
        }
        if (cell.vert) {
          const m = /left:(-?[\d.]+)mm;top:(-?[\d.]+)mm;width:([\d.]+)mm;height:([\d.]+)mm;/.exec(cell.vst ?? "");
          const w = W.slice(i, j).reduce((a, b) => a + b, 0);
          if (m)
            inner = `<div class="vbox" style="width:${w.toFixed(3)}mm;height:0;"><span style="left:${((w - +m[3]) / 2).toFixed(3)}mm;top:${m[2]}mm;width:${m[3]}mm;height:${m[4]}mm;">${inner}</span></div>`;
        }
        h += `<th colspan="${j - i}" rowspan="${cell.rs}" style="${cell.st}"${cell.vert ? ' class="vert"' : ""}${at}>${inner}</th>`;
      }
      i = j;
    }
    h += "</tr>";
  }
  if (D.gap) h += `<tr class="gap"><td colspan="${n}"></td></tr>`;
  h += "</thead><tbody>";
  R.coils.forEach((cl, ri) => {
    h +=
      "<tr>" +
      L.map((c) => `<td ${D.leaf[c.k].td}${R.coilOv && R.coilOv[ri + "." + c.k] ? ' data-o="ovr" title="단건 수정"' : ""}>${esc(cl[c.k] == null ? "" : cl[c.k])}</td>`).join("") +
      "</tr>";
  });
  if (R.coils.length <= 7) {
    const cells: { h?: string; b?: number; n?: number }[] = [];
    const blank = () => {
      const l = cells[cells.length - 1];
      if (l && l.b) l.n = (l.n ?? 0) + 1;
      else cells.push({ b: 1, n: 1 });
    };
    if (R.fk === "ko") {
      L.forEach((c, i) => {
        if (i === 0) cells.push({ h: "<td>TOTAL</td>" });
        else if (i === 1) cells.push({ h: `<td class="r">${R.coils.length}</td>` });
        else if (c.k === "wl") cells.push({ h: `<td class="r">${sumLines(R.coils.map((x) => x.wl), true)}</td>` });
        else blank();
      });
    } else {
      let K = L.findIndex((c) => c.k === "net" || c.k === "grs");
      if (K < 1) K = Math.min(2, n);
      cells.push({
        h: `<td colspan="${K}" class="c" style="white-space:pre;"><span style="letter-spacing:-0.184mm;">TOTAL</span><span style="display:inline-block; width:7.23mm;"></span><span style="letter-spacing:-0.155mm;">${R.coils.length} COIL</span></td>`,
      });
      L.slice(K).forEach((c) =>
        c.k === "net" || c.k === "grs" ? cells.push({ h: `<td class="r" style="white-space:pre-line;">${sumLines(R.coils.map((x) => x[c.k]))}</td>` }) : blank(),
      );
    }
    h += '<tr class="total">' + cells.map((x) => x.h || `<td colspan="${x.n}"></td>`).join("") + "</tr>";
  }
  return h + "</tbody></table>";
}

export function colorHtml(R: Snap) {
  const rows = R.coils
    .filter((c) => c._color)
    .map((c) => `<tr><td class="c">${esc(c._id)}</td><td class="c">:</td><td>${esc(c._color)}</td></tr>`)
    .join("");
  return `<table class="color" style="width:105.35mm;"><colgroup><col style="width:17.813mm"/><col style="width:3mm"/><col style="width:84.535mm"/></colgroup>${rows}</table>`;
}

export interface PaperImages {
  /** 종이 위 고정 그림(로고·마크·사본 표시) — 이름 → data URL. */
  imgs: Record<string, string>;
  /** 서명·도장 등록함 그림. 없으면 빈 글자. */
  imgSrc: (name: string) => string;
}

export function paperHtml(R: Snap, opt: PaperOpt, P: PaperImages) {
  const D = FORMDEF[R.fk];
  const O = (k: string) => `data-o="${R.src[k] || "base"}"${R.why[k] ? ` title="예외 규칙 ${esc(R.why[k])}"` : ""}`;
  const C = (k: string) => (opt.chg && opt.chg.has(k) ? " data-chg" : "");
  const v = opt.verify;
  const h = D.page.replace(/\{\{([^}]+)\}\}/g, (_m, k: string) => {
    if (k === "GRID") return gridHtml(R, opt);
    if (k === "COLOR") return colorHtml(R);
    if (k.startsWith("QR:")) {
      if (!R.qr) return "";
      const [pos, sty] = k.slice(3).split("|");
      return `<div class="img" style="${pos}" ${O("qr")}><img src="${qrUrl(v ? v.code : R.T["h.mtc"])}" style="${sty}"/></div>`;
    }
    if (k.startsWith("ORIG:")) {
      if (opt.copy === "사본") return "";
      const [pos, sty] = k.slice(5).split("|");
      return `<div class="img" style="${pos}"><img src="${P.imgs["original_mark.png"]}" style="${sty}"/></div>`;
    }
    if (k.startsWith("img:")) return P.imgs[k.slice(4)] || "";
    if (k === "STAMP") return R.stamp ? D.stamp.replace('<div class="img"', `<div ${O("stamp")} class="img"`).replace("{{STAMPIMG}}", P.imgSrc(R.stampImg) || BLANK) : "";
    if (k === "SIGNIMG") return (R.signImg && P.imgSrc(R.signImg)) || BLANK;
    if (k === "ISI") return R.mark ? D.isi.replace('<div class="img"', `<div ${O("mark")} class="img"`).replace(/\{\{img:([^}]+)\}\}/, (_x, n: string) => P.imgs[n]) : "";
    if (k === "f.page") return D.pageTxt;
    return `<span ${O(k)}${C(k.replace(/^f\./, ""))}>${esc(R.T[k])}</span>`;
  });
  const sec = v
    ? '<div class="secbg"></div>' +
      `<div class="verify">진위 확인 번호 <b>${esc(v.code)}</b> · 문서 해시 ${esc(v.hash.slice(0, 16))}</div>`
    : "";
  const extra = sec + (opt.draft ? '<div class="simband">초안 — 승인 전이라 발행에 쓰이지 않습니다</div>' : "") + (opt.copy === "사본" ? '<div class="simwm">COPY</div>' : "");
  return h.replace(/<\/div>\s*$/, extra + "</div>");
}
