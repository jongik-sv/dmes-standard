package com.dongkuk.dmes.mcm.job.builtin.collect;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Collection;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 수집(HTTP) 주소의 {@code {{이름}}} 변수 자리(설계 §5.0) — 저장 때 모양을 검사하고({@link #mask}), 실행 때 작업 변수 값을 넣어 주소를 만든다({@link #render}).
 * 관리자가 정한 주소를 서버가 부르므로 값이 주소의 구조를 바꾸지 못하게 한다(SSRF 방지).
 * <ul>
 *   <li>자리는 스킴·호스트·포트({@code scheme://authority}) 뒤, 곧 경로·쿼리에만 둘 수 있다. 앞쪽에 있으면 저장을 거절한다.</li>
 *   <li>값은 영문·숫자와 {@code - . _ ~} 만 그대로 두고 나머지는 모두 퍼센트 인코딩한다 — {@code / ? # & @ :} 와 공백·줄바꿈이 구조를 바꿀 수 없다.
 *       값 전체가 {@code .} 또는 {@code ..} 이면 경로 거슬러 오르기라 거절한다. 경로 자리({@code ?} 앞)는 값에 {@code / \ %} 나 {@code ..} 가 있으면 거절한다
 *       (인코딩한 %2F·%5C 를 대상 서버가 풀 수 있다). 쿼리 자리는 인코딩만 한다.</li>
 *   <li>이름은 그 작업의 변수에서 찾고, 없으면 위젯 시스템 변수 {@code today·yesterday·monthStart·now}(SQL 원천과 같다)를 쓴다. 둘 다 없으면 실행을 거절한다.</li>
 *   <li>만든 주소를 다시 검사해 스킴·호스트가 자리 없는 주소와 같은지 확인한다. 허용 호스트 검사는 호출자가 이 주소로 한다.</li>
 *   <li>실패 문구에는 주소 원문을 넣지 않는다(키가 질의에 있을 수 있다). 변수 이름(30자 이하 영문·숫자·밑줄)은 넣는다.</li>
 * </ul>
 */
public final class HttpUrlTemplate {

    static final int VALUE_MAX = 200;
    static final int RENDERED_MAX = 2000;
    /** 자리표시 글자 — 저장 검사에서 {@code {{이름}}} 대신 넣어 일반 주소로 읽는다. 호스트·스킴 자리에는 올 수 없어 검사 결과에 영향이 없다. */
    private static final String MASK = "x";
    private static final Pattern PLACEHOLDER = Pattern.compile("\\{\\{([A-Za-z][A-Za-z0-9_]{0,29})}}");
    private static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    private static final DateTimeFormatter YMD = DateTimeFormatter.ofPattern("yyyy-MM-dd");
    private static final DateTimeFormatter YMD_HMS = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ss");
    private static final char[] HEX = "0123456789ABCDEF".toCharArray();

    private HttpUrlTemplate() {}

    /** 주소 원문에 변수 자리가 있는가. */
    public static boolean hasVariables(String template) {
        return template != null && PLACEHOLDER.matcher(template).find();
    }

    /**
     * 저장 검사용 — 자리를 자리표시 글자로 바꾼 주소를 돌려준다(스킴·호스트 검사는 호출자가 {@link CollectConfigs#parseUrl}로 한다).
     * 자리가 스킴·호스트·포트 쪽에 있으면 {@link BusinessException}. null 이나 너무 긴 글자는 그대로 돌려줘 호출자가 거절하게 한다.
     */
    static String mask(String template) {
        if (template == null || template.length() > CollectConfigs.URL_MAX) return template;
        String text = template.strip();
        Matcher m = PLACEHOLDER.matcher(text);
        if (!m.find()) return text;
        int authorityEnd = authorityEnd(text);
        m.reset();
        while (m.find()) {
            if (m.start() < authorityEnd) {
                throw new BusinessException(ErrorCode.INVALID_VALUE, "수집 주소의 변수 {{이름}} 은 경로·쿼리에만 쓸 수 있습니다. 스킴·호스트·포트 자리에는 쓸 수 없습니다.");
            }
        }
        return m.replaceAll(MASK);
    }

    /** {@code scheme://authority} 가 끝나는 위치 — "://" 뒤 첫 {@code / ? #}, 없으면 끝. "://" 가 없으면 0(주소 전체를 앞쪽으로 본다). */
    private static int authorityEnd(String text) {
        int schemeEnd = text.indexOf("://");
        if (schemeEnd < 0) return text.length();
        for (int i = schemeEnd + 3; i < text.length(); i++) {
            char c = text.charAt(i);
            if (c == '/' || c == '?' || c == '#') return i;
        }
        return text.length();
    }

    /**
     * 실행용 — 자리마다 값을 퍼센트 인코딩해 넣고 주소를 만든다.
     *
     * @param source 저장 검사를 거친 원천(url 은 자리가 마스크된 주소)
     * @param vars   작업 변수 값(MCM 이 선점 때 확정해 넘긴 것)
     * @param today  서울 기준 예정 날짜 — 시스템 변수 {@code today·yesterday·monthStart} 의 기준
     */
    public static URI render(CollectConfig.HttpSource source, Map<String, Object> vars, LocalDate today) {
        String template = source.template();
        if (!hasVariables(template)) return source.url();
        Matcher m = PLACEHOLDER.matcher(template);
        StringBuilder out = new StringBuilder(template.length() + 32);
        int pathEnd = pathEnd(template);   // 이 위치 앞의 자리는 경로, 뒤는 쿼리·프래그먼트
        int last = 0;
        while (m.find()) {
            out.append(template, last, m.start());
            out.append(encode(m.group(1), valueOf(m.group(1), vars, today), m.start() < pathEnd));
            last = m.end();
            if (out.length() > RENDERED_MAX) throw tooLong();
        }
        out.append(template, last, template.length());
        if (out.length() > RENDERED_MAX) throw tooLong();
        URI rendered;
        try {
            rendered = CollectConfigs.parseUrl(out.toString(), RENDERED_MAX);
        } catch (BusinessException e) {
            throw new CollectException("변수를 넣은 수집 주소가 올바르지 않습니다.");
        }
        // 값 하나가 . 이 아니어도 템플릿 글자나 다른 값과 붙어 경로 조각이 . 또는 .. 이 될 수 있다("/.{{x}}/" + x=".") — 만든 경로 전체에서 막는다.
        String rawPath = rendered.getRawPath();
        if (rawPath != null) {
            for (String segment : rawPath.split("/", -1)) {
                if (".".equals(segment) || "..".equals(segment)) throw new CollectException("변수를 넣은 수집 주소의 경로에 . 또는 .. 조각이 생겨 수집하지 않습니다.");
            }
        }
        // 값이 인코딩돼 구조를 바꿀 수 없지만, 만든 주소가 자리 없는 주소와 같은 스킴·호스트·포트인지 한 번 더 본다.
        URI base = source.url();
        if (!sameOrigin(base, rendered)) throw new CollectException("변수를 넣은 수집 주소의 호스트가 달라져 수집하지 않습니다.");
        return rendered;
    }

    private static boolean sameOrigin(URI a, URI b) {
        return a.getScheme().equalsIgnoreCase(b.getScheme())
                && a.getHost().equalsIgnoreCase(b.getHost())
                && a.getPort() == b.getPort()
                && a.getRawUserInfo() == null && b.getRawUserInfo() == null;
    }

    private static Object valueOf(String name, Map<String, Object> vars, LocalDate today) {
        if (vars != null && vars.containsKey(name)) return vars.get(name);
        return switch (name) {
            case "today" -> YMD.format(today);
            case "yesterday" -> YMD.format(today.minusDays(1));
            case "monthStart" -> YMD.format(today.withDayOfMonth(1));
            case "now" -> YMD_HMS.format(LocalDateTime.now(ZONE));
            default -> throw new CollectException("정의되지 않은 변수입니다: {{" + name + "}}");
        };
    }

    private static CollectException tooLong() {
        return new CollectException("변수를 넣은 수집 주소가 " + RENDERED_MAX + "자를 넘어 수집하지 않습니다(한글 한 글자는 9자로 늘어납니다).");
    }

    /** 경로가 끝나는 위치 — 스킴·호스트 뒤 첫 {@code ?} 또는 {@code #}, 없으면 끝. 이 앞의 변수 자리는 경로 안이다. */
    private static int pathEnd(String template) {
        for (int i = authorityEnd(template); i < template.length(); i++) {
            char c = template.charAt(i);
            if (c == '?' || c == '#') return i;
        }
        return template.length();
    }

    /**
     * 값을 글자로 바꿔 퍼센트 인코딩한다. 비어 있거나 객체·목록이거나 너무 길면 거절한다.
     * 경로 자리({@code inPath})는 더 엄격하다: 값에 {@code /}·{@code \}·{@code %}·{@code ..} 가 있으면 거절한다. 인코딩(%2F·%5C)한 값도 대상 서버나
     * 프록시가 풀면 경로를 거슬러 오르거나 다른 경로로 갈 수 있다. 쿼리 자리는 인코딩만으로 충분하다.
     */
    private static String encode(String name, Object value, boolean inPath) {
        if (value == null || value instanceof Map<?, ?> || value instanceof Collection<?> || value.getClass().isArray()) {
            throw new CollectException("변수 {{" + name + "}} 의 값이 없거나 주소에 쓸 수 없는 형식입니다.");
        }
        String text = value instanceof java.math.BigDecimal bd ? bd.toPlainString() : String.valueOf(value);
        if (text.isEmpty()) throw new CollectException("변수 {{" + name + "}} 의 값이 비어 있습니다.");
        if (text.length() > VALUE_MAX) throw new CollectException("변수 {{" + name + "}} 의 값이 " + VALUE_MAX + "자를 넘습니다.");
        if (".".equals(text) || "..".equals(text)) throw new CollectException("변수 {{" + name + "}} 의 값은 . 또는 .. 일 수 없습니다.");
        if (inPath && (text.indexOf('/') >= 0 || text.indexOf('\\') >= 0 || text.indexOf('%') >= 0 || text.contains(".."))) {
            throw new CollectException("변수 {{" + name + "}} 는 경로 자리라서 값에 / \\ % .. 를 쓸 수 없습니다.");
        }
        StringBuilder sb = new StringBuilder(text.length() + 8);
        for (byte b : text.getBytes(StandardCharsets.UTF_8)) {
            int c = b & 0xff;
            if ((c >= 'A' && c <= 'Z') || (c >= 'a' && c <= 'z') || (c >= '0' && c <= '9') || c == '-' || c == '.' || c == '_' || c == '~') {
                sb.append((char) c);
            } else {
                sb.append('%').append(HEX[c >> 4]).append(HEX[c & 0x0f]);
            }
        }
        return sb.toString();
    }
}
