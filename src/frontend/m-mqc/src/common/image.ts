/**
 * 그림 파일 다루기 — 파일 → data URL, 폭 줄이기, 서명 그림 다듬기(흰 배경 지우기 → 여백 자르기 → 축소).
 * 브라우저 canvas 를 쓴다. 업무에 묶이지 않는 도구라 m-mqc 공통에 둔다.
 */

export function readFileAsDataUrl(f: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const fr = new FileReader();
    fr.onerror = () => reject(new Error("그림을 읽지 못했습니다."));
    fr.onload = () => resolve(String(fr.result));
    fr.readAsDataURL(f);
  });
}

function loadImage(src: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const im = new Image();
    im.onerror = () => reject(new Error("그림을 읽지 못했습니다. PNG·JPG 파일로 다시 시도하세요."));
    im.onload = () => resolve(im);
    im.src = src;
  });
}

/** 폭이 maxW 보다 크면 줄여 PNG data URL 로. 줄일 수 없으면 원본. */
export async function shrinkImage(src: string, maxW = 640): Promise<string> {
  const img = await loadImage(src);
  try {
    const sc = Math.min(1, maxW / img.width);
    const cv = document.createElement("canvas");
    cv.width = Math.max(1, Math.round(img.width * sc));
    cv.height = Math.max(1, Math.round(img.height * sc));
    cv.getContext("2d")!.drawImage(img, 0, 0, cv.width, cv.height);
    return cv.toDataURL("image/png");
  } catch {
    return src;
  }
}

/** 서명 그림 다듬기: 흰 배경 → 투명, 여백 자르기, 폭 900px 이하로. */
export async function cleanSignature(src: string): Promise<string> {
  const im = await loadImage(src);
  const w = im.naturalWidth;
  const h = im.naturalHeight;
  const c = document.createElement("canvas");
  c.width = w;
  c.height = h;
  const x = c.getContext("2d")!;
  x.drawImage(im, 0, 0);
  let d: ImageData;
  try {
    d = x.getImageData(0, 0, w, h);
  } catch {
    return src;
  }
  const a = d.data;
  for (let i = 0; i < a.length; i += 4) if (a[i] > 232 && a[i + 1] > 232 && a[i + 2] > 232) a[i + 3] = 0;
  let x0 = w;
  let y0 = h;
  let x1 = -1;
  let y1 = -1;
  for (let yy = 0; yy < h; yy++)
    for (let xx = 0; xx < w; xx++)
      if (a[(yy * w + xx) * 4 + 3] > 24) {
        if (xx < x0) x0 = xx;
        if (xx > x1) x1 = xx;
        if (yy < y0) y0 = yy;
        if (yy > y1) y1 = yy;
      }
  if (x1 < 0) return src;
  x.putImageData(d, 0, 0);
  const pad = Math.round(Math.max(w, h) * 0.012);
  const cw = Math.min(w, x1 - x0 + 1 + pad * 2);
  const ch = Math.min(h, y1 - y0 + 1 + pad * 2);
  const sc = Math.min(1, 900 / cw);
  const o = document.createElement("canvas");
  o.width = Math.max(1, Math.round(cw * sc));
  o.height = Math.max(1, Math.round(ch * sc));
  o.getContext("2d")!.drawImage(c, Math.max(0, x0 - pad), Math.max(0, y0 - pad), cw, ch, 0, 0, o.width, o.height);
  return o.toDataURL("image/png");
}
