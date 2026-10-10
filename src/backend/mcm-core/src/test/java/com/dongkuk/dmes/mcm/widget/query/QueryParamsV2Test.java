package com.dongkuk.dmes.mcm.widget.query;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.widget.query.QueryParams.Bound;
import java.math.BigDecimal;
import java.sql.Types;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

/**
 * 조건 2판(daterange·multi·codeGroup·상대 날짜) — 스펙 2026-10-10-custom-report-v2-design §2·§3. DB 없이 {@link QueryParams}·
 * {@link SqlGuard} 만 확인한다(바인드 펼침은 {@link WidgetQueryMultiBindTest}).
 */
class QueryParamsV2Test {

    private static final LocalDate TODAY = LocalDate.of(2026, 3, 31);

    private static List<QueryParam> parse(String json) {
        return QueryParams.fromDefsJson(json);
    }

    private static Map<String, Bound> resolve(String defs, List<String> used, Map<String, ?> given) {
        return QueryParams.resolve(parse(defs), used, given, false, TODAY, null);
    }

    private static void rejects(Runnable call, String fragment) {
        assertThatThrownBy(call::run).isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isIn(ErrorCode.INVALID_VALUE, ErrorCode.REQUIRED_VALUE))
                .hasMessageContaining(fragment);
    }

    private static final String RANGE = "[{\"name\":\"fromDt\",\"type\":\"daterange\",\"toName\":\"toDt\",\"default\":\"-7d\",\"toDefault\":\"0d\"}]";
    private static final String MULTI = "[{\"name\":\"st\",\"type\":\"multi\",\"countName\":\"stCnt\",\"options\":[{\"value\":\"S\"},{\"value\":\"H\"},{\"value\":\"A\"}]}]";

    @Test
    @DisplayName("상대 날짜 표(기준일 2026-03-31)")
    void relativeDates() {
        Map<String, String> expected = new java.util.LinkedHashMap<>();
        expected.put("0d", "2026-03-31"); expected.put("-7d", "2026-03-24"); expected.put("+1d", "2026-04-01");
        expected.put("-1w", "2026-03-24"); expected.put("-1M", "2026-02-28"); expected.put("-13M", "2025-02-28");
        expected.put("monthStart", "2026-03-01"); expected.put("monthEnd", "2026-03-31");
        expected.put("prevMonthStart", "2026-02-01"); expected.put("prevMonthEnd", "2026-02-28"); expected.put("yearStart", "2026-01-01");
        expected.forEach((word, date) -> assertThat(QueryParams.relativeDate(word, TODAY)).as(word).isEqualTo(LocalDate.parse(date)));
        assertThat(QueryParams.relativeDate("-1y", LocalDate.of(2024, 2, 29))).isEqualTo(LocalDate.of(2023, 2, 28));
        assertThat(QueryParams.relativeDate("abc", TODAY)).isNull();
        assertThat(QueryParams.relativeDate("1234d", TODAY)).isNull(); // 자릿수 상한 3
        assertThat(QueryParams.relativeDate("2026-03-31", TODAY)).isNull();
        rejects(() -> QueryParams.relativeDate("999y", LocalDate.of(9500, 1, 1)), "범위");
    }

    @Test
    @DisplayName("date 기본값의 상대 낱말은 today 로 풀고, 사용자가 보낸 값은 절대 날짜만 받는다")
    void dateDefaultRelativeButGivenAbsolute() {
        String defs = "[{\"name\":\"d\",\"type\":\"date\",\"default\":\"-1M\"}]";
        assertThat(resolve(defs, List.of("d"), Map.of()).get("d").value()).isEqualTo("20260228");
        assertThat(resolve(defs, List.of("d"), Map.of("d", "2026-01-05")).get("d").value()).isEqualTo("20260105");
        rejects(() -> resolve(defs, List.of("d"), Map.of("d", "-1M")), "실제 날짜");
        rejects(() -> parse("[{\"name\":\"d\",\"type\":\"date\",\"default\":\"junk\"}]"), "실제 날짜");
    }

    @Test
    @DisplayName("daterange: 두 바인드로 펼치고 순서·최대 일수·필수를 본다")
    void dateRange() {
        Map<String, Bound> r = resolve(RANGE, List.of("fromDt", "toDt"), Map.of());
        assertThat(r.get("fromDt").value()).isEqualTo("20260324");
        assertThat(r.get("toDt").value()).isEqualTo("20260331");
        assertThat(r.get("toDt").sqlType()).isEqualTo(Types.VARCHAR);
        // toName 만 SQL 에 써도 짝이 함께 풀린다
        assertThat(resolve(RANGE, List.of("toDt"), Map.of("fromDt", "2026-03-01", "toDt", "20260310")).get("fromDt").value()).isEqualTo("20260301");
        rejects(() -> resolve(RANGE, List.of("fromDt", "toDt"), Map.of("fromDt", "2026-03-10", "toDt", "2026-03-01")), "늦습니다");
        String capped = "[{\"name\":\"a\",\"type\":\"daterange\",\"toName\":\"b\",\"maxSpanDays\":31}]";
        resolve(capped, List.of("a", "b"), Map.of("a", "2026-10-01", "b", "2026-10-31")); // 31일 포함
        rejects(() -> resolve(capped, List.of("a", "b"), Map.of("a", "2026-10-01", "b", "2026-11-01")), "31일 이하");
        String required = "[{\"name\":\"a\",\"type\":\"daterange\",\"toName\":\"b\",\"required\":true}]";
        rejects(() -> resolve(required, List.of("a", "b"), Map.of()), "입력해 주세요");
        rejects(() -> resolve(required, List.of("a", "b"), Map.of("a", "2026-10-01")), "함께 입력");
        // 비필수는 둘 다 비면 형 붙은 null
        assertThat(resolve("[{\"name\":\"a\",\"type\":\"daterange\",\"toName\":\"b\"}]", List.of("a", "b"), Map.of()).get("b").value()).isNull();
    }

    @Test
    @DisplayName("daterange 정의 검사: toName 필수·이름 집합 겹침·maxSpanDays 범위")
    void dateRangeDefinition() {
        rejects(() -> parse("[{\"name\":\"a\",\"type\":\"daterange\"}]"), "이름");
        rejects(() -> parse("[{\"name\":\"a\",\"type\":\"daterange\",\"toName\":\"a\"}]"), "겹칩니다");
        rejects(() -> parse("[{\"name\":\"a\",\"type\":\"daterange\",\"toName\":\"today\"}]"), "시스템 변수");
        rejects(() -> parse("[{\"name\":\"b\",\"type\":\"text\"},{\"name\":\"a\",\"type\":\"daterange\",\"toName\":\"b\"}]"), "겹칩니다");
        for (String span : List.of("0", "3661", "1.5", "\"7\"")) {
            rejects(() -> parse("[{\"name\":\"a\",\"type\":\"daterange\",\"toName\":\"b\",\"maxSpanDays\":" + span + "}]"), "최대 일수");
        }
        parse("[{\"name\":\"a\",\"type\":\"daterange\",\"toName\":\"b\",\"maxSpanDays\":3660}]");
        assertThat(QueryParams.names(parse(RANGE))).containsExactly("fromDt", "toDt");
    }

    @Test
    @DisplayName("바인드 이름은 전체 20개까지")
    void bindNameLimit() {
        StringBuilder ok = new StringBuilder("[");
        for (int i = 0; i < 10; i++) ok.append(i > 0 ? "," : "").append("{\"name\":\"a").append(i).append("\",\"type\":\"daterange\",\"toName\":\"b").append(i).append("\"}");
        parse(ok + "]"); // 10개 · 이름 20개
        StringBuilder over = new StringBuilder("[");
        for (int i = 0; i < 10; i++) over.append(i > 0 ? "," : "").append("{\"name\":\"a").append(i).append("\",\"type\":\"multi\",\"countName\":\"c").append(i)
                .append("\",\"options\":[{\"value\":\"x\"}]}");
        parse(over + "]"); // 역시 20개
        rejects(() -> parse(over.toString().replace("\"countName\":\"c9\",", "\"countName\":\"c9\",") + ",{\"name\":\"z\",\"type\":\"text\"}]"), "최대 10개");
    }

    @Test
    @DisplayName("multi: 정규화(공백·중복·정렬)·개수·원소 한도·빈 선택 [null]·countName")
    void multi() {
        Map<String, Bound> r = resolve(MULTI, List.of("st"), Map.of("st", List.of(" S", "H", "S", "")));
        assertThat(r.get("st").value()).isEqualTo(List.of("H", "S"));
        assertThat(r.get("st").sqlType()).isEqualTo(Types.VARCHAR);
        assertThat(r.get("stCnt").value()).isEqualTo(BigDecimal.valueOf(2));
        assertThat(r.get("stCnt").sqlType()).isEqualTo(Types.NUMERIC);
        // 같은 선택은 순서가 달라도 같은 캐시 키 값
        assertThat(resolve(MULTI, List.of("st"), Map.of("st", List.of("S", "H"))).get("st").cacheValue()).isEqualTo(r.get("st").cacheValue());
        // 빈 선택 → [null] 한 칸, 개수 0
        Map<String, Bound> empty = resolve(MULTI, List.of("st"), Map.of("st", List.of()));
        assertThat((List<?>) empty.get("st").value()).hasSize(1).containsOnlyNulls();
        assertThat(empty.get("stCnt").value()).isEqualTo(BigDecimal.ZERO);
        assertThat((List<?>) resolve(MULTI, List.of("st"), Map.of()).get("st").value()).containsOnlyNulls();
        // 불변 목록
        assertThatThrownBy(() -> ((List<String>) r.get("st").value()).add("x")).isInstanceOf(UnsupportedOperationException.class);
        // 기본값은 쉼표 나눔
        String withDefault = MULTI.replace("\"countName\"", "\"default\":\"S,H\",\"countName\"");
        assertThat(resolve(withDefault, List.of("st"), Map.of()).get("st").value()).isEqualTo(List.of("H", "S"));
        rejects(() -> parse(MULTI.replace("\"countName\"", "\"default\":\"S,Z\",\"countName\"")), "선택지");
        // 선택지 밖
        rejects(() -> resolve(MULTI, List.of("st"), Map.of("st", List.of("S", "Z"))), "선택지");
        // NUL
        rejects(() -> resolve(MULTI, List.of("st"), Map.of("st", List.of("S\u0000"))), "쓸 수 없는");
        // 필수
        String required = MULTI.replace("\"countName\"", "\"required\":true,\"countName\"");
        rejects(() -> resolve(required, List.of("st"), Map.of("st", List.of())), "입력해 주세요");
    }

    @Test
    @DisplayName("multi 개수 한도 100: 100개는 되고 101개는 거절 — 코드 그룹 항목으로")
    void multiLimit() {
        Set<String> items = new java.util.TreeSet<>();
        List<String> picked = new ArrayList<>();
        for (int i = 0; i < 101; i++) {
            String code = String.format("C%03d", i);
            items.add(code);
            picked.add(code);
        }
        QueryCodeLookup lookup = new QueryCodeLookup() {
            public Set<String> items(String groupCd) { return items; }
            public boolean groupExists(String groupCd) { return true; }
        };
        List<QueryParam> defs = parse("[{\"name\":\"c\",\"type\":\"multi\",\"codeGroup\":\"BIG_GRP\"}]");
        assertThat((List<?>) QueryParams.resolve(defs, List.of("c"), Map.of("c", picked.subList(0, 100)), false, TODAY, lookup).get("c").value()).hasSize(100);
        rejects(() -> QueryParams.resolve(defs, List.of("c"), Map.of("c", picked), false, TODAY, lookup), "100개");
    }

    @Test
    @DisplayName("값 JSON: 글자 배열은 받고 비 multi 이름의 배열·multi 의 글자·객체·숫자 배열은 거절")
    void parseValuesArrays() {
        Map<String, Object> v = QueryParams.parseValues("{\"st\":[\"S\",\"H\"],\"x\":\"1\",\"n\":3}");
        assertThat(v.get("st")).isEqualTo(List.of("S", "H"));
        assertThat(v.get("n")).isEqualTo("3");
        for (String bad : List.of("{\"a\":[1]}", "{\"a\":[[\"x\"]]}", "{\"a\":{}}", "{\"a\":[null]}")) {
            rejects(() -> QueryParams.parseValues(bad), "입력 조건");
        }
        StringBuilder many = new StringBuilder("{\"a\":[");
        for (int i = 0; i < 101; i++) many.append(i > 0 ? "," : "").append("\"x\"");
        rejects(() -> QueryParams.parseValues(many + "]}"), "100개까지");
        assertThat(QueryParams.parseValues("{\"a\":[]}").get("a")).isEqualTo(List.of());
        assertThat(QueryParams.parseValues("{\"a\":\"" + "x".repeat(15900) + "\"}")).hasSize(1); // 16000자 한도 안
        rejects(() -> QueryParams.parseValues("{\"a\":\"" + "x".repeat(16000) + "\"}"), "너무 깁니다");
        // 정의 쪽 검사: 배열이 비 multi 이름에, 글자가 multi 에
        String text = "[{\"name\":\"t\",\"type\":\"text\"}]";
        rejects(() -> resolve(text, List.of("t"), Map.of("t", List.of("a"))), "글자 하나");
        rejects(() -> resolve(MULTI, List.of("st"), Map.of("st", "S")), "글자 목록");
        // daterange 이름에 배열
        rejects(() -> resolve(RANGE, List.of("fromDt"), Map.of("fromDt", List.of("2026-01-01"))), "글자 하나");
    }

    @Test
    @DisplayName("countName 은 요청이 보내도 읽지 않는다 — 서버가 고른 개수로 계산")
    void countNameIgnoredFromRequest() {
        Map<String, Bound> r = resolve(MULTI, List.of("st", "stCnt"), Map.of("st", List.of("S"), "stCnt", "0"));
        assertThat(r.get("stCnt").value()).isEqualTo(BigDecimal.ONE);
        Map<String, Bound> forged = resolve(MULTI, List.of("stCnt"), Map.of("stCnt", "99"));
        assertThat(forged.get("stCnt").value()).isEqualTo(BigDecimal.ZERO);
    }

    @Test
    @DisplayName("codeGroup: 형식·options 와 동시 금지·저장 때 그룹 존재·실행 때 항목 확인(lookup 없으면 실패 닫힘)")
    void codeGroup() {
        String defs = "[{\"name\":\"c\",\"type\":\"select\",\"codeGroup\":\"WIDGET_CTG\"}]";
        rejects(() -> parse(defs.replace("WIDGET_CTG", "bad group")), "코드 그룹");
        rejects(() -> parse(defs.replace("\"codeGroup\"", "\"options\":[{\"value\":\"a\"}],\"codeGroup\"")), "함께 쓸 수 없습니다");
        QueryCodeLookup lookup = new QueryCodeLookup() {
            public Set<String> items(String groupCd) { return "WIDGET_CTG".equals(groupCd) ? Set.of("PROD", "QUAL") : Set.of(); }
            public boolean groupExists(String groupCd) { return "WIDGET_CTG".equals(groupCd); }
        };
        List<QueryParam> parsed = parse(defs);
        QueryParams.requireCodeGroups(parsed, lookup);
        rejects(() -> QueryParams.requireCodeGroups(parse(defs.replace("WIDGET_CTG", "NO_SUCH_GRP")), lookup), "코드 그룹을 찾을 수 없습니다");
        rejects(() -> QueryParams.requireCodeGroups(parsed, null), "코드 그룹을 찾을 수 없습니다");
        assertThat(QueryParams.resolve(parsed, List.of("c"), Map.of("c", "PROD"), false, TODAY, lookup).get("c").value()).isEqualTo("PROD");
        rejects(() -> QueryParams.resolve(parsed, List.of("c"), Map.of("c", "NOPE"), false, TODAY, lookup), "선택지");
        rejects(() -> QueryParams.resolve(parsed, List.of("c"), Map.of("c", "PROD"), false, TODAY, null), "선택지"); // 실패 닫힘
        // 값이 비면 lookup 이 없어도 실행된다(그룹 없는 DB 에서 견본이 도는 조건)
        assertThat(QueryParams.resolve(parsed, List.of("c"), Map.of(), false, TODAY, null).get("c").value()).isNull();
        // 저장 때 기본값도 항목 확인
        String withDefault = defs.replace("\"codeGroup\"", "\"default\":\"ZZZ\",\"codeGroup\"");
        parse(withDefault); // 형식만 — 항목 확인은 lookup 이 있을 때
        rejects(() -> QueryParams.requireCodeGroups(parse(withDefault), lookup), "선택지");
    }

    @Test
    @DisplayName("SqlGuard: multi 이름은 IN (:x)·NOT IN (:x) 자리에서만")
    void sqlGuardListPosition() {
        Set<String> declared = Set.of("st", "stCnt", "a");
        Set<String> lists = Set.of("st");
        for (String ok : List.of(
                "SELECT 1 FROM T WHERE (:stCnt = 0 OR S IN (:st))",
                "SELECT 1 FROM T WHERE S NOT IN ( :st )",
                "SELECT 1 FROM T WHERE S in(:st) AND A = :a",
                "SELECT 1 FROM T WHERE X = '(:st)' AND S IN (:st) -- :st =\n")) {
            assertThat(SqlGuard.checkDeclared(ok, declared, lists).userVariables()).contains("st");
        }
        for (String bad : List.of(
                "SELECT 1 FROM T WHERE :st IS NULL",
                "SELECT 1 FROM T WHERE S = :st",
                "SELECT 1 FROM T WHERE S IN (:st, 'x')",
                "SELECT 1 FROM T WHERE S IN ('x', :st)",
                "SELECT 1 FROM T WHERE S IN ((:st))",
                "SELECT 1 FROM T WHERE S IN (UPPER(:st))",
                "SELECT 1 FROM T WHERE FN(:st) = 1",
                "SELECT 1 FROM T WHERE S IN (:st) AND Q = :st",
                "SELECT 1 FROM T WHERE S LIKE :st",
                "SELECT 1 FROM T WHERE XIN (:st)")) {
            assertThatThrownBy(() -> SqlGuard.checkDeclared(bad, declared, lists)).as(bad).isInstanceOf(BusinessException.class)
                    .hasMessageContaining("IN (:이름)");
        }
        // 목록 이름이 아니면 제한 없음
        assertThat(SqlGuard.checkDeclared("SELECT 1 FROM T WHERE :a IS NULL", declared, lists).userVariables()).contains("a");
        // 두 인자판은 제한 없음(호환)
        assertThat(SqlGuard.checkDeclared("SELECT 1 FROM T WHERE :st IS NULL", declared).userVariables()).contains("st");
    }

    @Test
    @DisplayName("빈 목록은 고른 것 없음 — 기본값이 있어도 비운다. 기간 값은 앞뒤 공백을 지우고, maxSpanDays 가 있으면 양끝을 비울 수 없다")
    void reviewFixes() {
        String withDefault = MULTI.replace("\"countName\"", "\"default\":\"S,H\",\"countName\"");
        Map<String, Bound> empty = resolve(withDefault, List.of("st"), Map.of("st", List.of()));
        assertThat((List<?>) empty.get("st").value()).containsOnlyNulls();
        assertThat(empty.get("stCnt").value()).isEqualTo(BigDecimal.ZERO);
        String spaced = "[{\"name\":\"a\",\"type\":\"daterange\",\"toName\":\"b\",\"default\":\" -7d\",\"toDefault\":\"0d \"}]";
        assertThat(resolve(spaced, List.of("a", "b"), Map.of()).get("a").value()).isEqualTo("20260324");
        assertThat(resolve(spaced, List.of("a", "b"), Map.of("a", " 2026-03-01 ", "b", "2026-03-02")).get("a").value()).isEqualTo("20260301");
        String capped = "[{\"name\":\"a\",\"type\":\"daterange\",\"toName\":\"b\",\"maxSpanDays\":7}]";
        rejects(() -> resolve(capped, List.of("a", "b"), Map.of()), "입력해 주세요");
        rejects(() -> resolve(capped, List.of("a", "b"), Map.of("a", " ", "b", " ")), "입력해 주세요");
        assertThat(QueryParams.resolve(parse(capped), List.of("a", "b"), Map.of(), true, TODAY, null).get("a").value()).isNull(); // 미리보기
    }

    @Test
    @DisplayName("SqlGuard IN 자리: 원문으로 판정 — 리터럴·식별자·주석을 공백으로 보지 않고 IN 은 ASCII 만")
    void sqlGuardListPositionStrict() {
        Set<String> declared = Set.of("st");
        Set<String> lists = Set.of("st");
        for (String bad : List.of(
                "SELECT 1 FROM T WHERE S 'x'IN (:st)",
                "SELECT 1 FROM T WHERE \"A\"IN (:st)",
                "SELECT 1 FROM T WHERE X = 1 AND S =(:st)",
                "SELECT 1 FROM T WHERE S \u0131N (:st)",
                "SELECT 1 FROM T WHERE S IN (/*c*/:st)",
                "SELECT 1 FROM T WHERE S.IN (:st)",
                "SELECT 1 FROM T WHERE S=IN (:st)",
                "SELECT * FROM T WHERE C = -- IN\n(:st)",
                "SELECT * FROM T WHERE (C = -- IN (\n:st)",
                "SELECT * FROM T WHERE NVL -- IN\n(:st) IS NULL")) {
            assertThatThrownBy(() -> SqlGuard.checkDeclared(bad, declared, lists)).as(bad).isInstanceOf(BusinessException.class);
        }
        SqlGuard.checkDeclared("SELECT 1 FROM T WHERE (S) IN (:st)", declared, lists);
        SqlGuard.checkDeclared("SELECT 1 FROM T WHERE X=1 AND(S IN(:st))", declared, lists);
        SqlGuard.checkDeclared("SELECT 1 FROM T WHERE S IN\n(\n:st\n)", declared, lists);
        SqlGuard.checkDeclared("SELECT 1 FROM T WHERE S NOT IN ( :st )", declared, lists);
        SqlGuard.checkDeclared("SELECT 1 FROM T -- note\nWHERE S IN (:st)", declared, lists);
    }

    @Test
    @DisplayName("저장 때 코드 그룹 확인 중 DB 오류는 안전한 문구의 BusinessException 으로 닫는다")
    void requireCodeGroupsFailsClosedOnLookupError() {
        QueryCodeLookup broken = new QueryCodeLookup() {
            public Set<String> items(String groupCd) { throw new IllegalStateException("ORA-00942 secret"); }
            public boolean groupExists(String groupCd) { throw new IllegalStateException("ORA-00942 secret"); }
        };
        List<QueryParam> defs = parse("[{\"name\":\"c\",\"type\":\"select\",\"codeGroup\":\"WIDGET_CTG\"}]");
        assertThatThrownBy(() -> QueryParams.requireCodeGroups(defs, broken)).isInstanceOf(BusinessException.class)
                .hasMessage(QueryParams.MSG_CODE_LOOKUP_FAILED);
    }
}
