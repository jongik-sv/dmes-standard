package com.dongkuk.dmes.mcm.queryroute;

import org.junit.jupiter.api.Test;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;

import java.nio.charset.StandardCharsets;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 조회 라우터 매퍼 정적 검사(설계 §5 D2·D4·D5(a), §4 S3) — 한 DB 시험은 통과해도 다른 운영 방언(PostgreSQL 등)에서만 어긋나는 것을 미리 막는다.
 * <ul>
 *   <li>select 목록의 모든 열에 큰따옴표 별칭({@code AS "키"}) — 따옴표 없는 별칭은 Oracle 이 대문자, PostgreSQL 이 소문자로 바꾼다.
 *       Oracle 한 DB 로 도는 동등성 시험으로는 PostgreSQL 쪽 어긋남이 잡히지 않는다.</li>
 *   <li>{@code SELECT *} 금지 — 키가 DB 열 이름 대소문자에 묶인다.</li>
 *   <li>{@code ${}} 문자열 치환 금지 — 요청값이 SQL 문자열이 된다.</li>
 *   <li>방언 전용 함수 금지({@code NVL}·{@code SYSDATE}·{@code GETDATE}·{@code ISNULL}·{@code DECODE}·{@code ROWNUM}·{@code TOP}·{@code (+)}).</li>
 * </ul>
 * 검사 대상은 라우터 노출 위치 {@code persistence/query/**}·{@code persistence/lov/**} 의 매퍼다.
 */
class QueryMapperLintTest {

    private static final Pattern SELECT_BLOCK = Pattern.compile("<select\\b[^>]*\\bid=\"([^\"]+)\"[^>]*>(.*?)</select>", Pattern.DOTALL);
    private static final Pattern XML_COMMENT = Pattern.compile("<!--.*?-->", Pattern.DOTALL);
    private static final Pattern SQL_LINE_COMMENT = Pattern.compile("--[^\\n]*");
    private static final Pattern QUOTED_ALIAS = Pattern.compile("(?is).*\\bAS\\s+\"[^\"]+\"\\s*$");
    private static final Pattern FORBIDDEN_FUNC = Pattern.compile(
            "(?i)\\b(NVL|NVL2|SYSDATE|GETDATE|ISNULL|DECODE|ROWNUM)\\s*\\(|\\bSYSDATE\\b|\\bROWNUM\\b|\\bSELECT\\s+TOP\\b|\\(\\+\\)");

    @Test
    void 라우터_매퍼는_방언_안전_규칙을_지킨다() throws Exception {
        Resource[] mappers = mappers();
        assertThat(mappers).as("시범 매퍼가 하나 이상 있어야 검사가 의미 있다").isNotEmpty();

        List<String> violations = new ArrayList<>();
        for (Resource mapper : mappers) {
            String xml = XML_COMMENT.matcher(mapper.getContentAsString(StandardCharsets.UTF_8)).replaceAll("");
            String name = mapper.getFilename();
            if (xml.contains("${")) {
                violations.add(name + ": ${} 문자열 치환");
            }
            Matcher m = SELECT_BLOCK.matcher(xml);
            while (m.find()) {
                String id = m.group(1);
                String sql = SQL_LINE_COMMENT.matcher(m.group(2)).replaceAll("");
                if (FORBIDDEN_FUNC.matcher(sql).find()) {
                    violations.add(name + "#" + id + ": 방언 전용 함수·문법");
                }
                for (String item : selectItems(sql)) {
                    if (item.equals("*") || item.endsWith(".*")) {
                        violations.add(name + "#" + id + ": SELECT *");
                    } else if (!QUOTED_ALIAS.matcher(item).matches()) {
                        violations.add(name + "#" + id + ": 큰따옴표 별칭 없음 — " + item);
                    }
                }
            }
        }
        assertThat(violations).isEmpty();
    }

    @Test
    void 검사기는_따옴표_없는_별칭을_잡는다() {
        assertThat(selectItems("SELECT CODE_VAL AS codeVal, X AS \"x\" FROM T"))
                .filteredOn(i -> !QUOTED_ALIAS.matcher(i).matches())
                .containsExactly("CODE_VAL AS codeVal");
        assertThat(selectItems("SELECT COALESCE(A, B) AS \"a\", CASE WHEN X = 1 THEN 'p,q' END AS \"c\" FROM T"))
                .hasSize(2)
                .allMatch(i -> QUOTED_ALIAS.matcher(i).matches());
    }

    private static Resource[] mappers() throws Exception {
        PathMatchingResourcePatternResolver resolver = new PathMatchingResourcePatternResolver();
        List<Resource> all = new ArrayList<>(List.of(resolver.getResources("classpath*:persistence/query/**/*.xml")));
        all.addAll(List.of(resolver.getResources("classpath*:persistence/lov/**/*.xml")));
        return all.toArray(new Resource[0]);
    }

    /** 첫 SELECT 와 같은 깊이의 첫 FROM 사이를 괄호·따옴표 밖 쉼표로 나눈다(부분 질의·함수 인자 안 쉼표는 무시). */
    static List<String> selectItems(String sql) {
        String upper = sql.toUpperCase();
        int start = indexOfWord(upper, "SELECT", 0);
        if (start < 0) {
            return List.of();
        }
        start += "SELECT".length();
        if (upper.startsWith(" DISTINCT", start) || upper.startsWith("\nDISTINCT", start)) {
            start = indexOfWord(upper, "DISTINCT", start) + "DISTINCT".length();
        }
        List<String> items = new ArrayList<>();
        int depth = 0;
        boolean inSingle = false;
        boolean inDouble = false;
        int itemStart = start;
        for (int i = start; i < sql.length(); i++) {
            char c = sql.charAt(i);
            if (c == '\'' && !inDouble) {
                inSingle = !inSingle;
            } else if (c == '"' && !inSingle) {
                inDouble = !inDouble;
            } else if (!inSingle && !inDouble) {
                if (c == '(') {
                    depth++;
                } else if (c == ')') {
                    depth--;
                } else if (depth == 0 && c == ',') {
                    items.add(sql.substring(itemStart, i).trim());
                    itemStart = i + 1;
                } else if (depth == 0 && indexOfWord(upper, "FROM", i) == i) {
                    items.add(sql.substring(itemStart, i).trim());
                    return items;
                }
            }
        }
        items.add(sql.substring(itemStart).trim());
        return items;
    }

    private static int indexOfWord(String upper, String word, int from) {
        int i = upper.indexOf(word, from);
        while (i >= 0) {
            boolean before = i == 0 || !Character.isLetterOrDigit(upper.charAt(i - 1)) && upper.charAt(i - 1) != '_';
            int end = i + word.length();
            boolean after = end >= upper.length() || !Character.isLetterOrDigit(upper.charAt(end)) && upper.charAt(end) != '_';
            if (before && after) {
                return i;
            }
            i = upper.indexOf(word, i + 1);
        }
        return -1;
    }
}
