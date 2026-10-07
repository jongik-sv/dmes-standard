/*
 * 작성자: Agent
 * 작성일: 2026-10-02
 * 내용: 공지 본문 HTML 소독 — CONTENT_FORMAT='HTML' 저장 시 서버에서 위험 요소 제거 (jsoup Safelist)
 */
package com.dongkuk.dmes.mcm.notice.common;

import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.safety.Safelist;

/**
 * 공지 본문 HTML 소독기.
 *
 * <p>공지는 모든 사용자의 포털 홈에 그대로 그려지므로 저장 시점에 서버가 한 번 걸러야 한다. 화면(FE)의 렌더러가
 * 다시 거르더라도, API 를 직접 부르는 경로까지 막는 최종 방어선은 서버다 (Mes-Guide §7 "서버 재검증").
 *
 * <p><b>허용 목록 방식</b> — jsoup {@link Safelist#relaxed()} 를 바탕으로 몇 개 태그만 더한다. 금지 목록이 아니라
 * 허용 목록이라 아래에 적지 않은 것은 모두 빠진다.
 * <ul>
 *   <li>태그: {@code script}·{@code iframe}·{@code object}·{@code embed}·{@code form}·{@code style}·{@code svg} 등
 *       허용 목록 밖의 태그는 통째로 제거된다(내용 텍스트는 태그에 따라 남거나 사라진다).</li>
 *   <li>속성: {@code on*} 이벤트 속성과 {@code style} 속성은 허용 목록에 없어 제거된다.</li>
 *   <li>URL: {@code a[href]} 는 http·https·mailto, {@code img[src]} 는 http·https 만 남는다.
 *       {@code javascript:}·{@code data:}·대소문자를 섞거나 제어문자를 끼운 변형도 제거된다.</li>
 * </ul>
 *
 * <p><b>알려진 부작용</b> — 상대 경로 링크와 {@code #anchor} 링크도 프로토콜이 없어 제거된다. 공지 본문은 외부 링크
 * 위주라 받아들였다(필요해지면 baseUri 를 정하고 {@code preserveRelativeLinks(true)} 를 검토한다).
 *
 * <p>{@code prettyPrint(false)} — 저장할 때마다 줄바꿈·들여쓰기가 바뀌지 않게 원문 공백을 유지한다.
 */
public final class NoticeHtmlSanitizer {

    private static final Safelist SAFELIST = Safelist.relaxed()
            .addTags("hr", "s", "del", "ins", "mark")
            // relaxed() 는 a[href] 에 ftp 도 허용한다. 공지 링크에 쓸 일이 없어 http·https·mailto 만 남긴다.
            .removeProtocols("a", "href", "ftp");

    private NoticeHtmlSanitizer() {
    }

    /**
     * 허용 목록 밖의 태그·속성·URL 을 제거한 HTML 조각을 돌려준다.
     *
     * @param html 사용자가 보낸 HTML. null 이면 null.
     * @return 소독된 HTML 조각(body 안쪽만)
     */
    public static String sanitize(String html) {
        if (html == null) {
            return null;
        }
        // OutputSettings 는 상태(인코더 등)를 가지므로 호출마다 새로 만든다 — 공유 인스턴스는 스레드 안전이 보장되지 않는다.
        return Jsoup.clean(html, "", SAFELIST, new Document.OutputSettings().prettyPrint(false));
    }
}
