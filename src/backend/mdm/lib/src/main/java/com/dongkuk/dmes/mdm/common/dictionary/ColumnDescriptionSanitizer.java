package com.dongkuk.dmes.mdm.common.dictionary;

import java.util.Set;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import org.jsoup.nodes.Node;
import org.jsoup.nodes.TextNode;
import org.jsoup.safety.Cleaner;
import org.jsoup.safety.Safelist;
import org.jsoup.select.NodeTraversor;
import org.jsoup.select.NodeVisitor;

/**
 * 컬럼 설명·활용처 메모 HTML 소독과 글자 추출(D-150). {@link ColumnDescriptionFormat#isHtml} 이 HTML 로 본 값에만 쓴다 — 일반 글을
 * 소독하면 {@code <}·{@code &} 가 엔티티로 바뀐다.
 *
 * <p><b>허용 목록</b> — mls {@code NoticeHtmlSanitizer} 와 같은 바탕이다: jsoup {@link Safelist#relaxed()} + {@code hr}·{@code s}·
 * {@code del}·{@code ins}·{@code mark}. 허용 목록 밖의 태그({@code script}·{@code iframe}·{@code svg}·{@code style} 등)·
 * {@code on*} 이벤트 속성·{@code style} 속성은 빠진다.
 *
 * <p><b>mls 판과 다른 점</b> — 링크({@code a[href]})도 이미지({@code img[src]})처럼 http·https 만 남긴다(mls 는 링크에 mailto 를 허용).
 * 프런트 렌더러 {@code sanitizeNoticeHtml}(shared {@code notice-body-view/sanitize.ts})이 http·https 만 남기므로 미리보기와 저장
 * 결과가 같게 맞췄다. mls 클래스를 의존하지 않는 까닭은 모듈 경계다(mdm 은 mls 를 모른다).
 *
 * <p>{@code prettyPrint(false)} — 저장할 때마다 줄바꿈·들여쓰기가 바뀌지 않게 원문 공백을 유지한다. 소독 결과는 고정점이라 두 번 해도
 * 같다(피드·view 가 저장된 값을 한 번 더 소독한다 — 옛 데이터 방어).
 */
public final class ColumnDescriptionSanitizer {

    private static final Safelist SAFELIST = Safelist.relaxed()
            .addTags("hr", "s", "del", "ins", "mark")
            // relaxed() 는 a[href] 에 ftp·mailto 도 허용한다. 프런트 렌더러와 맞춰 http·https 만 남긴다(mls 판은 mailto 를 남긴다).
            .removeProtocols("a", "href", "ftp", "mailto");

    /** 소독 고정점을 찾는 최대 횟수 — 재검토 퍼징(30만 건)에서 고정점까지 1회 약 96%, 2회 약 3.5%, 3회 22건이었다(pre 보정 뒤 4회 이상 0). */
    private static final int MAX_PASSES = 3;

    /** 글자 추출에서 앞뒤로 줄을 바꾸는 블록 요소. */
    private static final Set<String> BLOCKS = Set.of("p", "div", "ul", "ol", "li", "dl", "dt", "dd", "table", "caption", "thead",
            "tbody", "tfoot", "tr", "h1", "h2", "h3", "h4", "h5", "h6", "pre", "blockquote", "hr");
    /** 글자 추출에서 앞에 공백을 두는 표 칸. */
    private static final Set<String> CELLS = Set.of("td", "th");

    private ColumnDescriptionSanitizer() {
    }

    /**
     * 허용 목록 밖의 태그·속성·URL 을 뺀 HTML 조각(body 안쪽). 결과는 고정점이다 — 다시 소독해도 같다.
     *
     * <p>한 번 소독한 결과를 다시 파싱하면 구조가 바뀌는 입력이 있다(예: {@code <p><noscript><p title="</noscript>…">…} 는 1회
     * {@code <p><p></p></p>}, 2회 {@code <p></p><p></p><p></p>}). 그대로 두면 view 응답과 피드 {@code descriptionHtml}(재소독)이 어긋나므로
     * 결과가 바뀌지 않을 때까지 최대 {@value #MAX_PASSES}회 소독한다. 보통 입력은 두 번(두 번째는 확인)으로 끝난다.
     *
     * @param html HTML 로 판별된 값. null 이면 null.
     */
    public static String sanitize(String html) {
        if (html == null) {
            return null;
        }
        String out = clean(html);
        for (int pass = 1; pass < MAX_PASSES; pass++) {
            String again = clean(out);
            if (again.equals(out)) {
                break;
            }
            out = again;
        }
        return out;
    }

    private static String clean(String html) {
        // Jsoup.clean 과 같은 순서(본문 조각 파싱 → Cleaner → body 안쪽 출력)에 pre 보정 하나를 더한다.
        Document clean = new Cleaner(SAFELIST).clean(Jsoup.parseBodyFragment(html, ""));
        // OutputSettings 는 상태(인코더 등)를 가지므로 호출마다 새로 만든다 — 공유 인스턴스는 스레드 안전이 보장되지 않는다.
        clean.outputSettings(new Document.OutputSettings().prettyPrint(false));
        // HTML 파서는 <pre> 바로 뒤 줄바꿈 하나를 버리는데 jsoup 은 직렬화할 때 되살리지 않는다 — 그대로 두면 소독할 때마다 줄바꿈이
        // 하나씩 줄어 고정점에 닿지 않는다(재검토 R1). 첫 글이 줄바꿈으로 시작하는 pre 에 하나를 앞에 붙여 HTML 직렬화 규칙대로 낸다.
        for (Element pre : clean.body().select("pre")) {
            if (pre.childNodeSize() > 0 && pre.childNode(0) instanceof TextNode text && text.getWholeText().startsWith("\n")) {
                text.text("\n" + text.getWholeText());
            }
        }
        return clean.body().html();
    }

    /**
     * 저장·view·피드 공통 정규화 — 알려진 태그가 있으면({@link ColumnDescriptionFormat#isHtml}) 소독본, 일반 글이면 그대로 둔다(소독하면
     * {@code <}·{@code &} 가 엔티티로 바뀐다). 결과가 HTML 이면 늘 소독본이고, 두 번 해도 결과가 같다.
     *
     * <p>소독 뒤 알려진 태그가 하나도 남지 않으면(표 밖의 {@code <td>} 처럼 파서가 버린 경우) 그 소독본을 {@code <p>} 로 감싸 HTML 로 둔다
     * — 엔티티는 그대로라 화면에는 글자로 보인다. 글자가 없으면 null. 엔티티를 풀어 글자로 두면 안 된다: {@code <td>&lt;img src=x
     * onerror=…&gt;</td>} 를 풀면 {@code <img src=x onerror=…>} 가 되어 다시 HTML 로 판별되는 소독되지 않은 값이 저장·반환된다(검토 C1).
     *
     * @param value 설명·활용처 메모 원문. null 이면 null.
     */
    public static String normalize(String value) {
        if (!ColumnDescriptionFormat.isHtml(value)) {
            return value;
        }
        String html = sanitize(value);
        if (ColumnDescriptionFormat.isHtml(html)) {
            return html;
        }
        if (toText(html).isEmpty()) {
            return null;
        }
        // 감싼 뒤에도 소독한다 — 소독본 안의 블록(dl 등)이 <p> 를 닫아 구조가 바뀌므로 고정점을 다시 맞춘다. 결과는 <p> 로 시작해 늘 HTML 이다.
        return sanitize("<p>" + html + "</p>");
    }

    /**
     * 글자만 그리는 소비자용(메타 피드 description·usageNote, 컬럼 목록·중복 행, 룰 변수 설명) — {@link #normalize} 한 값이 HTML 이면 그 글자만
     * ({@link #toText}, 빈 글이면 null), 일반 글이면 그대로 돌려준다. 편집 폼이 쓰는 상세(view)는 이것을 쓰지 않고 {@link #normalize} 한 값(HTML 이면 소독본)을 준다.
     *
     * @param value 설명·활용처 메모 원문(저장값). null 이면 null.
     */
    public static String plainText(String value) {
        return plainTextOfNormalized(normalize(value));
    }

    /**
     * {@link #plainText} 의 뒷부분 — 이미 {@link #normalize} 한 값에서 다시 소독하지 않고 글자 칸 값을 만든다. 같은 값으로 HTML 칸과 글자 칸을
     * 함께 만드는 곳(메타 피드 description·descriptionHtml)이 소독을 한 번만 하게 쓴다.
     *
     * @param normalized {@link #normalize} 결과. null 이면 null.
     */
    public static String plainTextOfNormalized(String normalized) {
        if (!ColumnDescriptionFormat.isHtml(normalized)) {
            return normalized;
        }
        String text = toText(normalized);
        return text.isEmpty() ? null : text;
    }

    /**
     * HTML 조각의 글자만 — 엔티티는 풀고({@code &lt;} → {@code <}), 블록 요소 경계와 {@code br} 에서 줄을 바꾼다. 블록 안 공백은 하나로 줄이고
     * {@code pre} 안은 그대로 둔다. 표 칸은 공백으로 나눈다. 글자만 그리는 옛 소비자(툴팁 카드)가 태그 대신 읽을 글을 만든다.
     *
     * @param html HTML 로 판별된 값(소독본). null 이면 null. 글자가 없으면 빈 글.
     */
    public static String toText(String html) {
        if (html == null) {
            return null;
        }
        Element body = Jsoup.parseBodyFragment(html).body();
        StringBuilder out = new StringBuilder();
        NodeTraversor.traverse(new NodeVisitor() {
            @Override
            public void head(Node node, int depth) {
                if (node instanceof TextNode text) {
                    appendText(out, text);
                } else if (node instanceof Element e) {
                    String tag = e.normalName();
                    if ("br".equals(tag)) {
                        trimTrailingSpaces(out);
                        out.append('\n');
                    } else if (BLOCKS.contains(tag)) {
                        newLine(out);
                    } else if (CELLS.contains(tag)) {
                        space(out);
                    }
                }
            }

            @Override
            public void tail(Node node, int depth) {
                if (node instanceof Element e && BLOCKS.contains(e.normalName())) {
                    newLine(out);
                }
            }
        }, body);
        int end = out.length();
        while (end > 0 && Character.isWhitespace(out.charAt(end - 1))) {
            end--;
        }
        int start = 0;
        while (start < end && out.charAt(start) == '\n') {
            start++;
        }
        return out.substring(start, end);
    }

    private static void appendText(StringBuilder out, TextNode text) {
        if (inPre(text)) {
            out.append(text.getWholeText());
            return;
        }
        String s = text.text(); // 공백 덩어리를 공백 하나로 줄인 글
        if (out.isEmpty() || endsWithWhitespace(out)) {
            s = s.stripLeading();
        }
        out.append(s);
    }

    private static boolean inPre(TextNode text) {
        for (Element p = text.parent() instanceof Element e ? e : null; p != null; p = p.parent()) {
            if ("pre".equals(p.normalName())) {
                return true;
            }
        }
        return false;
    }

    /** 줄 끝 공백을 걷고, 이미 줄 첫머리가 아니면 줄을 바꾼다(블록이 겹쳐도 한 번만). */
    private static void newLine(StringBuilder out) {
        trimTrailingSpaces(out);
        if (!out.isEmpty() && out.charAt(out.length() - 1) != '\n') {
            out.append('\n');
        }
    }

    private static void space(StringBuilder out) {
        if (!out.isEmpty() && !endsWithWhitespace(out)) {
            out.append(' ');
        }
    }

    private static void trimTrailingSpaces(StringBuilder out) {
        int end = out.length();
        while (end > 0 && (out.charAt(end - 1) == ' ' || out.charAt(end - 1) == '\t')) {
            end--;
        }
        out.setLength(end);
    }

    private static boolean endsWithWhitespace(StringBuilder out) {
        return !out.isEmpty() && Character.isWhitespace(out.charAt(out.length() - 1));
    }
}
