/** @vitest-environment happy-dom */
/**
 * MdmMetaCard 소독 캐시(재검토 N6) — mdmCardSafeHtml 은 원문 문자열별로 소독 결과를 캐시한다.
 * 같은 원문이면 소독기(sanitizeNoticeHtml)를 다시 부르지 않고, 상한(MDM_CARD_SAFE_HTML_CACHE_MAX)에 이르면 비운다.
 */
import { describe, expect, it, vi } from "vitest";

vi.mock("../../src/components/notice-body-view/sanitize", async (importOriginal) => {
  const real =
    await importOriginal<typeof import("../../src/components/notice-body-view/sanitize")>();
  return { ...real, sanitizeNoticeHtml: vi.fn(real.sanitizeNoticeHtml) };
});

import { sanitizeNoticeHtml } from "../../src/components/notice-body-view/sanitize";
import {
  MDM_CARD_SAFE_HTML_CACHE_MAX,
  mdmCardSafeHtml,
  resetMdmCardSafeHtmlCache,
} from "../../src/mdm-meta/MdmMetaCard";

const sanitize = vi.mocked(sanitizeNoticeHtml);
const col = (html: string) => ({ descriptionHtml: html });

describe("mdmCardSafeHtml 소독 캐시", () => {
  it("같은 원문이면 소독기를 다시 부르지 않는다(보이는 내용이 없는 결과 null 도 캐시)", () => {
    sanitize.mockClear();
    expect(mdmCardSafeHtml(col("<p><b>굵은</b> 글</p>"))).toBe("<p><b>굵은</b> 글</p>");
    expect(mdmCardSafeHtml(col("<p><b>굵은</b> 글</p>"))).toBe("<p><b>굵은</b> 글</p>");
    expect(mdmCardSafeHtml(col("<p></p>"))).toBeNull();
    expect(mdmCardSafeHtml(col("<p></p>"))).toBeNull();
    expect(sanitize).toHaveBeenCalledTimes(2);
  });

  it(`상한(${MDM_CARD_SAFE_HTML_CACHE_MAX})에 이르면 통째로 비운다 — 처음 원문도, 상한 직전에 넣은 원문도 다시 소독한다`, () => {
    expect(MDM_CARD_SAFE_HTML_CACHE_MAX).toBe(500);
    resetMdmCardSafeHtmlCache();
    const first = "<p>처음</p>";
    const last = "<p>마지막</p>";
    mdmCardSafeHtml(col(first));
    for (let i = 0; i < MDM_CARD_SAFE_HTML_CACHE_MAX - 2; i++)
      mdmCardSafeHtml(col(`<p>채움 ${i}</p>`));
    mdmCardSafeHtml(col(last)); // 이제 꽉 찼다(500)
    sanitize.mockClear();
    mdmCardSafeHtml(col(first));
    mdmCardSafeHtml(col(last));
    expect(sanitize).not.toHaveBeenCalled(); // 꽉 찰 때까지는 모두 남아 있다
    mdmCardSafeHtml(col("<p>넘침</p>")); // 501번째 — 통째로 비우고 넣는다
    sanitize.mockClear();
    mdmCardSafeHtml(col(last)); // 오래된 것부터 하나씩 내보내는 방식이면 남아 있을 원문
    mdmCardSafeHtml(col(first));
    expect(sanitize).toHaveBeenCalledTimes(2);
  });
});
