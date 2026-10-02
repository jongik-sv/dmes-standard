/**
 * 공지 HTML 소독 — DOMPurify 전용 인스턴스(전역 DOMPurify 에 훅을 더하지 않는다).
 * 금지: script·style·iframe·object·embed·form 계열 태그, on* 속성(DOMPurify 기본), 인라인 style 속성, http/https 가 아닌 링크·이미지 주소.
 * 주소 규칙은 서버 소독(mls NoticeHtmlSanitizer — img[src] http·https 만)과 맞춰 미리보기와 저장 결과가 같게 한다.
 * 링크(a[href])는 새 탭(target="_blank" rel="noopener noreferrer")으로 연다. 브라우저 DOM 이 있어야 하므로 서버에서는 null 을 돌려준다.
 */
import DOMPurify from "dompurify";

import { isSafeHref } from "../markdown-editor/md-ops";

type Purifier = ReturnType<typeof DOMPurify>;

const FORBID_TAGS = [
  "script",
  "style",
  "iframe",
  "frame",
  "frameset",
  "object",
  "embed",
  "form",
  "input",
  "button",
  "select",
  "textarea",
  "link",
  "meta",
  "base",
  "svg",
  "math",
];

let purifier: Purifier | null = null;

function getPurifier(): Purifier | null {
  if (purifier) return purifier;
  if (typeof window === "undefined") return null;
  const p = DOMPurify(window);
  if (!p.isSupported) return null;
  // 링크·이미지 주소: http/https 만 남긴다(javascript:·data:·mailto: 등과 상대 주소는 속성을 지운다).
  p.addHook("uponSanitizeAttribute", (_node, data) => {
    if ((data.attrName === "href" || data.attrName === "src") && !isSafeHref(data.attrValue)) {
      data.keepAttr = false;
    }
  });
  p.addHook("afterSanitizeAttributes", (node) => {
    if (node.tagName === "A") {
      if (node.hasAttribute("href")) {
        node.setAttribute("target", "_blank");
        node.setAttribute("rel", "noopener noreferrer");
      } else {
        node.removeAttribute("target");
        node.removeAttribute("rel");
      }
    }
  });
  purifier = p;
  return p;
}

/** 소독한 HTML 문자열. DOM 이 없는 환경(서버)이면 null. */
export function sanitizeNoticeHtml(html: string): string | null {
  const p = getPurifier();
  if (!p) return null;
  return p.sanitize(html, {
    USE_PROFILES: { html: true },
    FORBID_TAGS,
    FORBID_ATTR: ["style", "srcset", "formaction", "target", "rel"],
    ALLOW_DATA_ATTR: false,
    ALLOW_ARIA_ATTR: true,
  });
}
