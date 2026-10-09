package com.dongkuk.dmes.mcm.widget.query;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.def.WidgetDefSavedEvent;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.node.ObjectNode;
import com.zaxxer.hikari.HikariDataSource;
import java.math.BigDecimal;
import java.sql.Types;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * 쿼리 위젯 사용자 입력 조건 — 스펙 2026-10-02-widget-admin-generic 입력 조건. Oracle 시험 PDB({@link McmCoreOraTestDb}, MCMAPUSER)의
 * 시험 전용 표 {@code T_C4_WIDGET_P} 에 실제 JDBC 로 확인한다.
 * 값은 늘 바인드 변수로만 들어가는지(인젝션 문자열이 와도 행이 늘지 않음), 형별 해석·거절, 결과 캐시 키가 조건 값에 따라 갈리는지를 본다.
 */
class WidgetQueryParamsTest {

    private static final ObjectMapper JSON = new ObjectMapper();
    private static final Instant T0 = Instant.parse("2026-10-01T03:00:00Z");
    private static final String INJECTION = "' OR 1=1 --";

    private static final String TABLE = "T_C4_WIDGET_P";
    private static HikariDataSource pool;

    private JdbcTemplate jdbc;
    private WidgetDefRepository defRepository;
    private WidgetUserContextResolver resolver;
    private TestClock clock;
    private WidgetQueryExecutor executor;

    @BeforeAll
    static void createTable() {
        pool = McmCoreOraTestDb.appDataSource("widget-query-params");
        JdbcTemplate ddl = new JdbcTemplate(pool);
        dropTable(ddl);
        ddl.execute("CREATE TABLE " + TABLE + " (ID NUMBER(10) PRIMARY KEY, NM VARCHAR2(250), AMT NUMBER(10,2), DT VARCHAR2(8), PLANT VARCHAR2(10))");
        McmCoreOraTestDb.awaitReadOnlyReadable(McmCoreOraTestDb.APP_USER, TABLE); // ORA-01466 — 만든 직후 읽기 전용 스냅샷
    }

    @AfterAll
    static void dropTableAndClosePool() {
        try {
            dropTable(new JdbcTemplate(pool));
        } finally {
            pool.close();
        }
    }

    @BeforeEach
    void setUp() {
        jdbc = new JdbcTemplate(pool);
        jdbc.execute("DELETE FROM " + TABLE);
        // ID 1..10: NM=N<ID>, AMT=ID*1.5, DT=20261001..20261010, PLANT=P1(홀수)/P2(짝수)
        jdbc.execute("INSERT INTO " + TABLE + " (ID, NM, AMT, DT, PLANT)"
                + " SELECT LEVEL, CONCAT('N', LEVEL), LEVEL * 1.5, CONCAT('202610', LPAD(TO_CHAR(LEVEL), 2, '0')),"
                + " CASE WHEN MOD(LEVEL, 2) = 1 THEN 'P1' ELSE 'P2' END FROM DUAL CONNECT BY LEVEL <= 10");
        jdbc.update("INSERT INTO T_C4_WIDGET_P (ID, NM, AMT, DT, PLANT) VALUES (11, ?, 0, '20261011', 'P1')", INJECTION);
        defRepository = mock(WidgetDefRepository.class);
        clock = new TestClock(T0);
        resolver = mock(WidgetUserContextResolver.class);
        // 앱 기본 DataSource(전용 설정 없음) — Oracle 은 읽기 전용 트랜잭션을 거는 갈래라 전용 DataSource 가 없어도 실행한다.
        executor = new WidgetQueryExecutor(defRepository, resolver, WidgetQueryDataSource.shared(pool), clock);
    }

    /** 표가 있으면 지운다(ORA-00942 만 무시). */
    private static void dropTable(JdbcTemplate jdbc) {
        jdbc.execute("BEGIN EXECUTE IMMEDIATE 'DROP TABLE " + TABLE + " PURGE'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -942 THEN RAISE; END IF; END;");
    }

    // ── 형별 정상 실행 ───────────────────────────────────────────────

    @Test
    @DisplayName("text 조건은 글자 그대로 바인드한다")
    void textParam() {
        def("def.text", "SELECT ID FROM T_C4_WIDGET_P WHERE NM = :nm ORDER BY ID", "[{\"name\":\"nm\",\"type\":\"text\"}]");
        assertThat(ids("def.text", Map.of("nm", "N3"))).containsExactly(3);
    }

    @Test
    @DisplayName("number 조건은 BigDecimal 로 파싱해 NUMERIC 으로 바인드한다 — 6 과 6.0 은 같은 값")
    void numberParam() {
        def("def.num", "SELECT ID FROM T_C4_WIDGET_P WHERE AMT > :min ORDER BY ID", "[{\"name\":\"min\",\"type\":\"number\"}]");
        assertThat(ids("def.num", Map.of("min", "12"))).containsExactly(9, 10);
        assertThat(ids("def.num", Map.of("min", " 12.0 "))).containsExactly(9, 10);
    }

    @Test
    @DisplayName("date 조건은 yyyy-MM-dd·yyyyMMdd 를 받아 yyyyMMdd 글자로 정규화해 바인드한다")
    void dateParam() {
        def("def.date", "SELECT ID FROM T_C4_WIDGET_P WHERE DT >= :from AND DT <= :to ORDER BY ID",
                "[{\"name\":\"from\",\"type\":\"date\"},{\"name\":\"to\",\"type\":\"date\"}]");
        assertThat(ids("def.date", Map.of("from", "2026-10-03", "to", "20261005"))).containsExactly(3, 4, 5);
    }

    @Test
    @DisplayName("select 조건은 선언된 선택지 값만 받는다")
    void selectParam() {
        def("def.sel", "SELECT ID FROM T_C4_WIDGET_P WHERE PLANT = :plant AND ID <= 10 ORDER BY ID",
                "[{\"name\":\"plant\",\"type\":\"select\",\"options\":[{\"value\":\"P1\",\"label\":\"1공장\"},{\"value\":\"P2\"}]}]");
        assertThat(ids("def.sel", Map.of("plant", "P2"))).containsExactly(2, 4, 6, 8, 10);
        assertMessage(() -> executor.runDefinition("def.sel", 500, Map.of("plant", "P3")), "입력 조건 plant 의 값은 선택지 중 하나여야 합니다.");
        assertMessage(() -> executor.runDefinition("def.sel", 500, Map.of("plant", "p2")), "입력 조건 plant 의 값은 선택지 중 하나여야 합니다.");
    }

    @Test
    @DisplayName("값 없는 선택 조건은 (:x IS NULL OR COL = :x) 가 전체를 돌려주고, 값이 있으면 거른다 — 형 붙은 null 바인드")
    void optionalParamBindsTypedNull() {
        def("def.opt", "SELECT ID FROM T_C4_WIDGET_P WHERE (:plant IS NULL OR PLANT = :plant) AND (:min IS NULL OR AMT > :min) AND ID <= 10 ORDER BY ID",
                "[{\"name\":\"plant\",\"type\":\"text\"},{\"name\":\"min\",\"type\":\"number\"}]");
        assertThat(ids("def.opt", Map.of())).hasSize(10);
        assertThat(ids("def.opt", Map.of("plant", "  ", "min", ""))).hasSize(10);
        assertThat(ids("def.opt", Map.of("plant", "P1"))).containsExactly(1, 3, 5, 7, 9);
        assertThat(ids("def.opt", Map.of("plant", "P1", "min", "9"))).containsExactly(7, 9);
    }

    @Test
    @DisplayName("기본값은 키가 없을 때만 쓴다 — 키가 있고 값이 비면(공백 포함) 값 없음: 필수면 거절, 아니면 형 붙은 null(전체 조회)")
    void defaultOnlyWhenKeyAbsent() {
        def("def.dflt", "SELECT ID FROM T_C4_WIDGET_P WHERE (:plant IS NULL OR PLANT = :plant) AND ID <= 10 ORDER BY ID",
                "[{\"name\":\"plant\",\"type\":\"text\",\"default\":\"P2\"}]");
        assertThat(ids("def.dflt", Map.of())).containsExactly(2, 4, 6, 8, 10);              // 키 없음 → 기본값
        assertThat(ids("def.dflt", Map.of("plant", ""))).hasSize(10);                       // 빈 글자 → 값 없음(전체)
        assertThat(ids("def.dflt", Map.of("plant", "   "))).hasSize(10);
        Map<String, String> jsonNull = new HashMap<>();
        jsonNull.put("plant", null);
        assertThat(ids("def.dflt", jsonNull)).containsExactly(2, 4, 6, 8, 10);              // null 은 키 없음과 같다
        assertThat(ids("def.dflt", Map.of("plant", "P1"))).containsExactly(1, 3, 5, 7, 9);

        def("def.dflt2", "SELECT ID FROM T_C4_WIDGET_P WHERE PLANT = :plant AND ID <= 10 ORDER BY ID",
                "[{\"name\":\"plant\",\"type\":\"text\",\"default\":\"P2\",\"required\":true}]");
        assertThat(ids("def.dflt2", Map.of())).containsExactly(2, 4, 6, 8, 10);              // 키 없음 → 기본값
        assertMessage(() -> executor.runDefinition("def.dflt2", 500, Map.of("plant", "  ")), "입력 조건 plant 의 값을 입력해 주세요.");
        assertThatThrownBy(() -> executor.runDefinition("def.dflt2", 500, Map.of("plant", "")))
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE));
        assertThat(ids("def.dflt2", Map.of("plant", "P1"))).containsExactly(1, 3, 5, 7, 9);
    }

    @Test
    @DisplayName("기존 2인자 runDefinition 은 값 없이 3인자로 위임한다")
    void twoArgDelegates() {
        def("def.two", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_P", null);
        assertThat(((Number) executor.runDefinition("def.two", 500).rows().get(0).get("CNT")).longValue()).isEqualTo(11L);
    }

    // ── 거절 ─────────────────────────────────────────────────────────

    @Test
    @DisplayName("필수 조건은 값도 기본값도 없으면(공백만 포함) 거절한다")
    void requiredMissing() {
        def("def.req", "SELECT ID FROM T_C4_WIDGET_P WHERE PLANT = :plant", "[{\"name\":\"plant\",\"type\":\"text\",\"label\":\"공장\",\"required\":true}]");
        assertThatThrownBy(() -> executor.runDefinition("def.req", 500, Map.of()))
                .isInstanceOf(BusinessException.class).hasMessage("입력 조건 공장 의 값을 입력해 주세요.")
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE));
        assertMessage(() -> executor.runDefinition("def.req", 500, Map.of("plant", " \t ")), "입력 조건 공장 의 값을 입력해 주세요.");
        Map<String, String> withNull = new HashMap<>();
        withNull.put("plant", null);
        assertMessage(() -> executor.runDefinition("def.req", 500, withNull), "입력 조건 공장 의 값을 입력해 주세요.");
    }

    @Test
    @DisplayName("값이 200자를 넘으면 거절한다 — 200자는 통과")
    void valueTooLong() {
        def("def.long", "SELECT ID FROM T_C4_WIDGET_P WHERE NM = :nm", "[{\"name\":\"nm\",\"type\":\"text\"}]");
        assertThat(executor.runDefinition("def.long", 500, Map.of("nm", "x".repeat(200))).rows()).isEmpty();
        assertMessage(() -> executor.runDefinition("def.long", 500, Map.of("nm", "x".repeat(201))), "입력 조건 nm 의 값은 200자 이하여야 합니다.");
    }

    @ParameterizedTest
    @ValueSource(strings = {"abc", "1,000", "0x10", "NaN", "Infinity", "1e999999999", "1e-999999999", "12345678901234567890123456789012345678901234567890"})
    @DisplayName("number 가 숫자로 파싱되지 않거나 너무 크면 거절한다")
    void numberInvalid(String value) {
        def("def.badnum", "SELECT ID FROM T_C4_WIDGET_P WHERE AMT > :min", "[{\"name\":\"min\",\"type\":\"number\"}]");
        assertThatThrownBy(() -> executor.runDefinition("def.badnum", 500, Map.of("min", value)))
                .isInstanceOf(BusinessException.class)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));
    }

    @ParameterizedTest
    @ValueSource(strings = {"2026/10/01", "2026-13-01", "2026-02-30", "20261301", "2026-1-1", "26-10-01", "2026-10-01 00:00", "２０２６１００１", "2026-10-01'; --"})
    @DisplayName("date 형식·실제 날짜가 아니면 거절한다")
    void dateInvalid(String value) {
        def("def.baddate", "SELECT ID FROM T_C4_WIDGET_P WHERE DT >= :from", "[{\"name\":\"from\",\"type\":\"date\"}]");
        assertMessage(() -> executor.runDefinition("def.baddate", 500, Map.of("from", value)),
                "입력 조건 from 의 값은 yyyy-MM-dd 또는 yyyyMMdd 형식의 실제 날짜여야 합니다.");
    }

    @Test
    @DisplayName("SQL 이 쓰는 :name 이 정의에 선언되지 않았으면 거절한다 — 선언이 없을 때·대소문자가 다를 때·덩어리 이름")
    void undeclaredBindRejected() {
        def("def.undecl", "SELECT ID FROM T_C4_WIDGET_P WHERE NM = :nm", null);
        assertThatThrownBy(() -> executor.runDefinition("def.undecl", 500, Map.of("nm", "N1")))
                .isInstanceOf(BusinessException.class).hasMessageContaining("알 수 없는 변수입니다: :nm");

        def("def.case", "SELECT ID FROM T_C4_WIDGET_P WHERE NM = :Nm", "[{\"name\":\"nm\",\"type\":\"text\"}]");
        assertMessage(() -> executor.runDefinition("def.case", 500, Map.of("nm", "N1")),
                "알 수 없는 변수입니다: :Nm (쓸 수 있는 변수: :userId, :deptCd, :today, :yesterday, :monthStart, :now, :bizDate, :bizYesterday, :baseHour / 선언한 조건: :nm)");

        def("def.dot", "SELECT ID FROM T_C4_WIDGET_P WHERE NM = :nm.x", "[{\"name\":\"nm\",\"type\":\"text\"}]");
        assertThatThrownBy(() -> executor.runDefinition("def.dot", 500, Map.of("nm", "N1")))
                .isInstanceOf(BusinessException.class).hasMessageContaining(":nm.x");
    }

    @Test
    @DisplayName("저장된 정의에 시스템 변수와 같은 이름·겹친 이름·잘못된 모양이 들어 있어도 실행 때 다시 거절한다")
    void badStoredDefinitionRejectedAtRun() {
        def("def.sys", "SELECT ID FROM T_C4_WIDGET_P WHERE NM = :userId", "[{\"name\":\"userId\",\"type\":\"text\"}]");
        assertMessage(() -> executor.runDefinition("def.sys", 500, Map.of("userId", "hacker")),
                "입력 조건 이름 :userId 은(는) 시스템 변수 이름과 같아 쓸 수 없습니다.");
        def("def.dup", "SELECT 1 AS A FROM T_C4_WIDGET_P", "[{\"name\":\"a\",\"type\":\"text\"},{\"name\":\"a\",\"type\":\"text\"}]");
        assertMessage(() -> executor.runDefinition("def.dup", 500, Map.of()), "입력 조건 이름이 겹칩니다: :a");
        def("def.shape", "SELECT 1 AS A FROM T_C4_WIDGET_P", "{\"name\":\"a\"}");
        assertMessage(() -> executor.runDefinition("def.shape", 500, Map.of()), "입력 조건(params)은 배열이어야 합니다.");
    }

    @Test
    @DisplayName("전기일 시스템 변수 이름(bizDate·bizYesterday·baseHour)도 입력 조건 이름으로 쓸 수 없다")
    void bizDayNamesRejectedAsParamNames() {
        for (String reserved : List.of("bizDate", "bizYesterday", "baseHour")) {
            String id = "def.biz-" + reserved;
            def(id, "SELECT 1 AS A FROM T_C4_WIDGET_P", "[{\"name\":\"" + reserved + "\",\"type\":\"text\"}]");
            assertMessage(() -> executor.runDefinition(id, 500, Map.of()),
                    "입력 조건 이름 :" + reserved + " 은(는) 시스템 변수 이름과 같아 쓸 수 없습니다.");
        }
    }

    @Test
    @DisplayName("선언되지 않은 이름·SQL 이 쓰지 않는 선언 이름의 값은 읽지 않는다 — 크기·형이 이상해도 무시")
    void unusedAndUndeclaredValuesIgnored() {
        def("def.ign", "SELECT ID FROM T_C4_WIDGET_P WHERE NM = :nm", "[{\"name\":\"nm\",\"type\":\"text\"},{\"name\":\"unused\",\"type\":\"number\",\"required\":true}]");
        assertThat(ids("def.ign", Map.of("nm", "N2", "ghost", "x".repeat(5000), "unused", "abc"))).containsExactly(2);
    }

    // ── 인젝션 ───────────────────────────────────────────────────────

    @ParameterizedTest
    @ValueSource(strings = {INJECTION, "x' OR '1'='1", "N1' UNION SELECT 1 --", "'; DROP TABLE T_C4_WIDGET_P; --", "\\' OR 1=1 --"})
    @DisplayName("SQL 인젝션 문자열이 값으로 와도 바인드로만 쓰여 행이 늘지 않고 표도 그대로다")
    void injectionStaysAValue(String attack) {
        def("def.inj", "SELECT ID FROM T_C4_WIDGET_P WHERE NM = :nm ORDER BY ID", "[{\"name\":\"nm\",\"type\":\"text\"}]");
        // 값 자체와 같은 글자가 든 행(11번)만 맞는다 — 조건을 깨고 전체 행이 나오지 않는다.
        List<Integer> expected = attack.equals(INJECTION) ? List.of(11) : List.of();
        assertThat(ids("def.inj", Map.of("nm", attack))).isEqualTo(expected);
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM T_C4_WIDGET_P", Long.class)).isEqualTo(11L);
    }

    @Test
    @DisplayName("select·date·number 의 인젝션 문자열은 해석 단계에서 거절한다")
    void injectionRejectedByType() {
        def("def.inj2", "SELECT ID FROM T_C4_WIDGET_P WHERE PLANT = :p AND DT >= :d AND AMT > :n",
                "[{\"name\":\"p\",\"type\":\"select\",\"options\":[{\"value\":\"P1\"}]},{\"name\":\"d\",\"type\":\"date\"},{\"name\":\"n\",\"type\":\"number\"}]");
        assertThatThrownBy(() -> executor.runDefinition("def.inj2", 500, Map.of("p", INJECTION, "d", "20261001", "n", "1")))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> executor.runDefinition("def.inj2", 500, Map.of("p", "P1", "d", INJECTION, "n", "1")))
                .isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> executor.runDefinition("def.inj2", 500, Map.of("p", "P1", "d", "20261001", "n", "1 OR 1=1")))
                .isInstanceOf(BusinessException.class);
    }

    // ── 결과 캐시 ────────────────────────────────────────────────────

    @Test
    @DisplayName("캐시 키가 조건 값에 따라 갈린다 — 값이 다르면 다른 결과, 같으면(정규화 뒤에도) 캐시 적중, 정의 저장 이벤트는 모두 비운다")
    void cacheKeySplitsByValue() {
        def("def.cache", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_P WHERE PLANT = :plant AND AMT > :min AND DT >= :from",
                "[{\"name\":\"plant\",\"type\":\"text\"},{\"name\":\"min\",\"type\":\"number\"},{\"name\":\"from\",\"type\":\"date\"}]");
        Map<String, String> p1 = Map.of("plant", "P1", "min", "0", "from", "2026-10-01");
        Map<String, String> p2 = Map.of("plant", "P2", "min", "0", "from", "2026-10-01");
        assertThat(count("def.cache", p1)).isEqualTo(5L); // 1,3,5,7,9 (11번은 AMT=0)
        assertThat(count("def.cache", p2)).isEqualTo(5L); // 2,4,6,8,10
        jdbc.update("INSERT INTO T_C4_WIDGET_P (ID, NM, AMT, DT, PLANT) VALUES (12, 'N12', 18, '20261012', 'P1')");
        // 같은 값 — 표현만 다르다(0 → 0.00, 날짜 구분자) — 이어도 정규화해 같은 키: 옛 결과
        assertThat(count("def.cache", Map.of("plant", "P1", "min", "0.00", "from", "20261001"))).isEqualTo(5L);
        assertThat(executor.cacheSize()).isEqualTo(2);
        // 값이 다르면 새로 조회(날짜가 다르면 3 — 7,9,12, 숫자 하한이 다르면 6 — 1,3,5,7,9,12)
        assertThat(count("def.cache", Map.of("plant", "P1", "min", "0", "from", "2026-10-06"))).isEqualTo(3L);
        assertThat(count("def.cache", Map.of("plant", "P1", "min", "1", "from", "2026-10-01"))).isEqualTo(6L);
    }

    @Test
    @DisplayName("다른 값으로 부르면 새로 조회하고, 같은 값은 30초 동안 한 항목을 다시 쓴다")
    void cacheHitAndMissByValue() {
        def("def.c2", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_P WHERE PLANT = :plant", "[{\"name\":\"plant\",\"type\":\"text\"}]");
        assertThat(count("def.c2", Map.of("plant", "P1"))).isEqualTo(6L);
        jdbc.update("INSERT INTO T_C4_WIDGET_P (ID, NM, AMT, DT, PLANT) VALUES (12, 'N12', 18, '20261012', 'P1')");
        assertThat(count("def.c2", Map.of("plant", "P1"))).isEqualTo(6L);   // 적중 — 옛 결과
        assertThat(count("def.c2", Map.of("plant", "P2"))).isEqualTo(5L);   // 다른 값 — 새 조회
        clock.advance(Duration.ofSeconds(31));
        assertThat(count("def.c2", Map.of("plant", "P1"))).isEqualTo(7L);   // 만료 — 다시 조회

        executor.onDefSaved(new WidgetDefSavedEvent("def.c2"));
        assertThat(executor.cacheSize()).isZero();
    }

    @Test
    @DisplayName("값을 비우는 것과 기본값을 직접 보내는 것은 같은 키다")
    void cacheKeyNullVersusValue() {
        def("def.c3", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_P WHERE (:plant IS NULL OR PLANT = :plant)",
                "[{\"name\":\"plant\",\"type\":\"text\",\"default\":\"P1\"}]");
        assertThat(count("def.c3", Map.of())).isEqualTo(6L);
        assertThat(count("def.c3", Map.of("plant", "P1"))).isEqualTo(6L);
        assertThat(executor.cacheSize()).isEqualTo(1);
    }

    @Test
    @DisplayName("조건 값 조합이 많아도 정의 하나가 차지하는 캐시 항목은 상한(50)을 넘지 않는다")
    void cacheBoundedPerDefinition() {
        def("def.many", "SELECT ID FROM T_C4_WIDGET_P WHERE NM = :nm", "[{\"name\":\"nm\",\"type\":\"text\"}]");
        def("def.other", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_P", null);
        for (int i = 0; i < 80; i++) executor.runDefinition("def.many", 500, Map.of("nm", "v" + i));
        assertThat(executor.cacheSize()).isEqualTo(WidgetQueryExecutor.CACHE_MAX_ENTRIES_PER_PARAM_DEF);
        // 다른 정의는 여전히 캐시된다
        executor.runDefinition("def.other", 500, Map.of());
        assertThat(executor.cacheSize()).isEqualTo(WidgetQueryExecutor.CACHE_MAX_ENTRIES_PER_PARAM_DEF + 1);
    }

    // ── 미리보기·저장 검사 ───────────────────────────────────────────

    @Test
    @DisplayName("미리보기는 조건 정의의 기본값을 값으로 쓴다")
    void previewUsesDefaults() {
        String defs = "[{\"name\":\"plant\",\"type\":\"text\",\"default\":\"P2\"},{\"name\":\"min\",\"type\":\"number\",\"default\":\"12\"}]";
        WidgetQueryResult r = executor.preview("mcm", "SELECT ID FROM T_C4_WIDGET_P WHERE PLANT = :plant AND AMT > :min ORDER BY ID", 50, defs);
        assertThat(r.rows()).extracting(row -> ((Number) row.get("ID")).intValue()).containsExactly(10); // Oracle NUMBER → BigDecimal
    }

    @Test
    @DisplayName("미리보기는 값 없는 필수 조건을 거절하지 않고 형 붙은 null 로 바인드한다")
    void previewRequiredWithoutDefaultBindsNull() {
        String defs = "[{\"name\":\"plant\",\"type\":\"text\",\"required\":true},{\"name\":\"min\",\"type\":\"number\",\"required\":true}]";
        WidgetQueryResult r = executor.preview("mcm",
                "SELECT ID FROM T_C4_WIDGET_P WHERE (:plant IS NULL OR PLANT = :plant) AND (:min IS NULL OR AMT > :min) AND ID <= 3 ORDER BY ID", 50, defs);
        assertThat(r.rows()).hasSize(3);
    }

    @Test
    @DisplayName("미리보기도 선언 없는 바인드는 거절하고, 선언했지만 SQL 에 없는 조건은 거절하지 않는다. 정의가 없으면 이전과 같다")
    void previewValidatesDeclarations() {
        assertThatThrownBy(() -> executor.preview("mcm", "SELECT ID FROM T_C4_WIDGET_P WHERE NM = :nm", 50, "[]"))
                .isInstanceOf(BusinessException.class).hasMessageContaining("알 수 없는 변수입니다: :nm");
        assertThat(executor.preview("mcm", "SELECT ID FROM T_C4_WIDGET_P WHERE ID = 1", 50,
                "[{\"name\":\"nm\",\"type\":\"text\"}]").rows()).hasSize(1);
        assertThat(executor.preview("mcm", "SELECT ID FROM T_C4_WIDGET_P WHERE ID = 1", 50, null).rows()).hasSize(1);
        assertThat(executor.preview("mcm", "SELECT ID FROM T_C4_WIDGET_P WHERE ID = 1", 50).rows()).hasSize(1);
        assertThatThrownBy(() -> executor.preview("mcm", "SELECT 1 AS A FROM T_C4_WIDGET_P", 50, "not json"))
                .isInstanceOf(BusinessException.class).hasMessageContaining("올바른 JSON 이 아닙니다");
        assertThatThrownBy(() -> executor.preview("mcm", "SELECT 1 AS A FROM T_C4_WIDGET_P", 50, "[{\"name\":\"now\",\"type\":\"text\"}]"))
                .isInstanceOf(BusinessException.class).hasMessageContaining("시스템 변수 이름");
        assertThatThrownBy(() -> executor.preview("mcm", "SELECT 1 AS A FROM T_C4_WIDGET_P", 50, "[{\"name\":\"baseHour\",\"type\":\"text\"}]"))
                .isInstanceOf(BusinessException.class).hasMessageContaining("시스템 변수 이름");
    }

    @Test
    @DisplayName("validateSql(sql, 선언 이름)은 SQL 이 쓰는 사용자 조건 이름을 처음 나온 순서·중복 없이 돌려준다")
    void validateSqlReturnsUsedNames() {
        List<String> used = executor.validateSql("SELECT ID FROM T_C4_WIDGET_P WHERE NM = :b AND PLANT = :a AND NM <> :b AND PLANT = :userId", Set.of("a", "b", "c"));
        assertThat(used).containsExactly("b", "a");
        assertThat(executor.validateSql("SELECT 1 AS A FROM T_C4_WIDGET_P", Set.of("a"))).isEmpty();
        assertThatThrownBy(() -> executor.validateSql("SELECT ID FROM T_C4_WIDGET_P WHERE NM = :x", Set.of("a")))
                .isInstanceOf(BusinessException.class).hasMessageContaining(":x");
        // 기존 1인자 판은 시스템 변수 외 거절 그대로
        assertThatThrownBy(() -> executor.validateSql("SELECT ID FROM T_C4_WIDGET_P WHERE NM = :a"))
                .isInstanceOf(BusinessException.class).hasMessageContaining("알 수 없는 변수입니다: :a");
    }

    // ── SqlGuard·QueryParams 단위 ────────────────────────────────────

    @Test
    @DisplayName("SqlGuard: 선언 이름은 정확히 일치할 때만 사용자 바인드, 시스템 이름은 선언해도 시스템 변수다")
    void sqlGuardDeclaredNames() {
        SqlGuard.Validated v = SqlGuard.checkDeclared("SELECT 1 FROM T WHERE A = :plant AND B = :today AND C = :plant AND D = &qty", Set.of("plant", "qty", "today"));
        assertThat(v.variables()).containsExactly("today");
        assertThat(v.userVariables()).containsExactly("plant", "qty");
        assertThat(SqlGuard.check("SELECT 1 FROM T WHERE A = :userId").userVariables()).isEmpty();
        assertThatThrownBy(() -> SqlGuard.checkDeclared("SELECT 1 FROM T WHERE A = :plant.x", Set.of("plant"))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> SqlGuard.checkDeclared("SELECT 1 FROM T WHERE A = :Plant", Set.of("plant"))).isInstanceOf(BusinessException.class);
        assertThatThrownBy(() -> SqlGuard.checkDeclared("SELECT 1 FROM T WHERE A = :plant", Set.of())).isInstanceOf(BusinessException.class);
        // 선언해도 4단계 금지 낱말·함수 거절은 그대로
        assertThatThrownBy(() -> SqlGuard.checkDeclared("SELECT pg_sleep(:plant) FROM T", Set.of("plant"))).isInstanceOf(BusinessException.class);
        // 기존 호출처 호환 — 2인자 생성자
        assertThat(new SqlGuard.Validated("SELECT 1", List.of()).userVariables()).isEmpty();
    }

    @Test
    @DisplayName("QueryParams.resolve: 형별 바인드 값·형·정규화, 선언 밖 값은 읽지 않는다")
    void queryParamsResolve() {
        List<QueryParam> defs = QueryParams.fromDefsJson("[{\"name\":\"n\",\"type\":\"number\"},{\"name\":\"d\",\"type\":\"date\"},"
                + "{\"name\":\"t\",\"type\":\"text\"},{\"name\":\"s\",\"type\":\"select\",\"options\":[{\"value\":\"A\"}]},{\"name\":\"z\",\"type\":\"number\"}]");
        Map<String, QueryParams.Bound> bound = QueryParams.resolve(defs, List.of("n", "d", "t", "s", "z"),
                Map.of("n", "10.50", "d", "2026-10-05", "t", "  keep  ", "s", " A ", "extra", "[1,2]"), false);
        assertThat(bound.get("n").value()).isEqualTo(new BigDecimal("10.5"));
        assertThat(bound.get("n").sqlType()).isEqualTo(Types.NUMERIC);
        assertThat(bound.get("n").cacheValue()).isEqualTo(bound.get("n").value());
        assertThat(bound.get("d").value()).isEqualTo("20261005");
        assertThat(bound.get("d").sqlType()).isEqualTo(Types.VARCHAR);
        assertThat(bound.get("t").value()).isEqualTo("  keep  ");
        assertThat(bound.get("s").value()).isEqualTo("A");
        assertThat(bound.get("z").value()).isNull();
        assertThat(bound.get("z").sqlType()).isEqualTo(Types.NUMERIC);
        assertThat(bound).doesNotContainKey("extra");
        assertThat(bound.values()).allSatisfy(b -> assertThat(b.value() == null || b.value() instanceof BigDecimal || b.value() instanceof String).isTrue());
    }

    @Test
    @DisplayName("QueryParams.parseValues: 스칼라만 받고 배열·객체·잘못된 JSON·겹친 키·군더더기는 거절한다")
    void parseValues() {
        assertThat(QueryParams.parseValues(null)).isEmpty();
        assertThat(QueryParams.parseValues("  ")).isEmpty();
        assertThat(QueryParams.parseValues("null")).isEmpty();
        assertThat(QueryParams.parseValues("{\"a\":\"x\",\"b\":3,\"c\":true,\"d\":null,\"e\":1.50}"))
                .containsEntry("a", "x").containsEntry("b", "3").containsEntry("c", "true").containsEntry("e", "1.50").doesNotContainKey("d");
        for (String bad : List.of("[]", "[\"a\"]", "\"s\"", "5", "{\"a\":[1]}", "{\"a\":[]}", "{\"a\":{}}", "{\"a\":\"1\",\"a\":\"2\"}", "{\"a\":1} x", "{", "{\"a\":\"" + "x".repeat(4000) + "\"}")) {
            assertThatThrownBy(() -> QueryParams.parseValues(bad)).as(bad.length() > 60 ? "긴 값" : bad)
                    .isInstanceOf(BusinessException.class)
                    .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));
        }
    }

    @Test
    @DisplayName("number 는 정규화한 값을 바인드하고 키에도 쓴다 — 10·1E+1·10.0 은 한 항목, 1.0·1 도 한 항목")
    void numberNormalizedForBindAndKey() {
        List<QueryParam> defs = QueryParams.fromDefsJson("[{\"name\":\"n\",\"type\":\"number\"}]");
        for (String text : List.of("10", "1E+1", "1e1", "10.0", "100E-1", "+10", " 10 ")) {
            Object v = QueryParams.resolve(defs, List.of("n"), Map.of("n", text), false).get("n").value();
            assertThat(v).as(text).isEqualTo(new BigDecimal("10")).isEqualTo(BigDecimal.TEN);
            assertThat(((BigDecimal) v).scale()).as(text).isZero();
            assertThat(((BigDecimal) v).toString()).as(text).isEqualTo("10");
        }
        assertThat(QueryParams.resolve(defs, List.of("n"), Map.of("n", "0.00"), false).get("n").value()).isEqualTo(BigDecimal.ZERO);
        assertThat(QueryParams.resolve(defs, List.of("n"), Map.of("n", "1E+37"), false).get("n").value()).isEqualTo(new BigDecimal("1" + "0".repeat(37)));
        assertThatThrownBy(() -> QueryParams.resolve(defs, List.of("n"), Map.of("n", "1E+38"), false)).isInstanceOf(BusinessException.class);

        def("def.nn", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_P WHERE AMT > :min", "[{\"name\":\"min\",\"type\":\"number\"}]");
        long first = count("def.nn", Map.of("min", "1"));
        jdbc.update("INSERT INTO T_C4_WIDGET_P (ID, NM, AMT, DT, PLANT) VALUES (12, 'N12', 18, '20261012', 'P1')");
        assertThat(count("def.nn", Map.of("min", "1.0"))).isEqualTo(first);   // 한 항목 — 옛 결과
        assertThat(count("def.nn", Map.of("min", "10"))).isEqualTo(5L);        // 새 조회: AMT 10.5·12·13.5·15·18 (ID 7·8·9·10·12)
        assertThat(count("def.nn", Map.of("min", "1E+1"))).isEqualTo(5L);      // 같은 항목
        assertThat(executor.cacheSize()).isEqualTo(2);
    }

    @Test
    @DisplayName("결과 캐시 정의별 상한(50)은 조건 없는 정의에도 적용된다 — :userId 만 쓰는 정의가 사용자마다 항목을 만들어도")
    void cacheBoundedPerDefinitionWithoutParams() {
        def("def.users", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_P WHERE NM <> :userId", null);
        def("def.other2", "SELECT COUNT(*) AS CNT FROM T_C4_WIDGET_P", null);
        for (int i = 0; i < 80; i++) {
            when(resolver.current()).thenReturn(new com.dongkuk.dmes.mcm.widget.common.WidgetUserContext("u" + i, "u" + i, "D1", null, List.of("D1")));
            executor.runDefinition("def.users", 500, Map.of());
        }
        assertThat(executor.cacheSize()).isEqualTo(WidgetQueryExecutor.CACHE_MAX_ENTRIES_PER_PARAM_DEF);
        executor.runDefinition("def.other2", 500, Map.of());   // 다른 정의는 여전히 캐시된다(전체 상한 1000 안)
        assertThat(executor.cacheSize()).isEqualTo(WidgetQueryExecutor.CACHE_MAX_ENTRIES_PER_PARAM_DEF + 1);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "SELECT ID FROM T WHERE USER_ID = \\:userId OR N = :p",
            "SELECT ID FROM T WHERE USER_ID = \\&userId OR N = :p",
            "SELECT ID FROM T WHERE USER_ID = @userId OR N = :p",
            "SELECT ID FROM T WHERE USER_ID = $userId OR N = :p",
            "SELECT ID FROM T WHERE USER_ID = $1 OR N = :p",
            "SELECT ID FROM T WHERE (USER_ID=@x) AND N = :p",
            "SELECT ID FROM T WHERE N = :p AND USER_ID IN ($2, $3)"})
    @DisplayName("SqlGuard: Spring 이 바꾸지 않는 DB 고유 자리표시자(\\:x·@x·$x·$1)는 거절한다 — 자리가 밀려 값이 :userId 자리로 들어가는 것을 막는다")
    void dbPlaceholdersRejected(String sql) {
        assertThatThrownBy(() -> SqlGuard.checkDeclared(sql, Set.of("p")))
                .isInstanceOf(BusinessException.class).hasMessage(SqlGuard.MSG_DB_PLACEHOLDER);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "SELECT A$B FROM T WHERE N = :p",
            "SELECT ID FROM T WHERE TAGS @> ARRAY[1] AND N = :p",
            "SELECT ID FROM T WHERE DOC @@ QUERY AND N = :p",
            "SELECT ID FROM T WHERE N = :p AND X = '\\:userId @x $1'",
            "SELECT CAST(N AS INT)::TEXT FROM T WHERE N = :p"})
    @DisplayName("SqlGuard: 자리표시자가 아닌 @·$·\\(식별자·연산자·문자열 리터럴 안·캐스트)는 통과한다")
    void nonPlaceholdersAccepted(String sql) {
        assertThat(SqlGuard.checkDeclared(sql, Set.of("p")).userVariables()).containsExactly("p");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "SELECT A FROM T@LINK WHERE N = :p",
            "SELECT A$B, F@LINK FROM T WHERE N = :p"})
    @DisplayName("SqlGuard: Oracle DB 링크(이름@링크)는 자리표시자가 아니지만 원격 실행이라 DB 링크 문구로 거절한다(oracle-1007 c3)")
    void dbLinksRejected(String sql) {
        assertThatThrownBy(() -> SqlGuard.checkDeclared(sql, Set.of("p")))
                .isInstanceOf(BusinessException.class).hasMessage(SqlGuard.MSG_DB_LINK);
    }

    @Test
    @DisplayName("사후 검사: Spring 이 바꾼 SQL 에 :이름·@이름·$숫자 가 남으면 거절하고, ? 만 남으면 통과한다")
    void leftoverPlaceholders() {
        SqlGuard.requireNoLeftoverPlaceholders("SELECT ID FROM T WHERE A = ? AND B = ? AND C::INT = 1 AND D = ':x'");
        for (String bad : List.of("SELECT ID FROM T WHERE A = :userId", "SELECT ID FROM T WHERE A = @x", "SELECT ID FROM T WHERE A = $1")) {
            assertThatThrownBy(() -> SqlGuard.requireNoLeftoverPlaceholders(bad)).isInstanceOf(BusinessException.class)
                    .hasMessage(SqlGuard.MSG_DB_PLACEHOLDER);
        }
    }

    @Test
    @DisplayName("저장·실행 경로(실행기)도 \\:userId 같은 자리 밀기 SQL 을 거절한다")
    void executorRejectsEscapedPlaceholder() {
        assertThatThrownBy(() -> executor.validateSql("SELECT ID FROM T_C4_WIDGET_P WHERE NM = \\:userId OR NM = :p", Set.of("p")))
                .isInstanceOf(BusinessException.class).hasMessage(SqlGuard.MSG_DB_PLACEHOLDER);
        def("def.esc", "SELECT ID FROM T_C4_WIDGET_P WHERE NM = \\:userId OR NM = :p", "[{\"name\":\"p\",\"type\":\"text\"}]");
        assertMessage(() -> executor.runDefinition("def.esc", 500, Map.of("p", "N1")), SqlGuard.MSG_DB_PLACEHOLDER);
        assertThatThrownBy(() -> executor.preview("mcm", "SELECT ID FROM T_C4_WIDGET_P WHERE NM = @x OR NM = :p", 50,
                "[{\"name\":\"p\",\"type\":\"text\"}]")).isInstanceOf(BusinessException.class).hasMessage(SqlGuard.MSG_DB_PLACEHOLDER);
    }

    // ── helpers ──────────────────────────────────────────────────────

    private WidgetDef def(String id, String sql, String paramsJson) {
        WidgetDef d = new WidgetDef();
        d.setWidgetId(id);
        d.setSrcTp(WidgetDef.SRC_DEF);
        d.setTypeId("query-table");
        d.setUseYn("Y");
        d.setDataSrc("mcm");
        try {
            ObjectNode config = JSON.createObjectNode();
            config.put("sql", sql);
            if (paramsJson != null) config.set("params", JSON.readTree(paramsJson));
            d.setConfigJson(JSON.writeValueAsString(config));
        } catch (Exception e) {
            throw new IllegalStateException(e);
        }
        when(defRepository.findById(id)).thenReturn(Optional.of(d));
        return d;
    }

    private List<Integer> ids(String defId, Map<String, String> values) {
        return executor.runDefinition(defId, 500, values).rows().stream().map(r -> ((Number) r.get("ID")).intValue()).toList();
    }

    private long count(String defId, Map<String, String> values) {
        return ((Number) executor.runDefinition(defId, 500, values).rows().get(0).get("CNT")).longValue();
    }

    private static void assertMessage(org.assertj.core.api.ThrowableAssert.ThrowingCallable call, String message) {
        assertThatThrownBy(call).isInstanceOf(BusinessException.class).hasMessage(message);
    }

    private static final class TestClock extends Clock {
        private Instant now;

        TestClock(Instant now) {
            this.now = now;
        }

        void advance(Duration d) {
            now = now.plus(d);
        }

        @Override
        public java.time.ZoneId getZone() {
            return ZoneOffset.UTC;
        }

        @Override
        public Clock withZone(java.time.ZoneId zone) {
            return this;
        }

        @Override
        public Instant instant() {
            return now;
        }
    }
}
