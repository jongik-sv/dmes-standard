package com.dongkuk.dmes.mcm.widget.query;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.assertj.core.api.Assertions.catchThrowable;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.testdb.McmCoreOraTestDb;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContext;
import com.dongkuk.dmes.mcm.widget.common.WidgetUserContextResolver;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import com.zaxxer.hikari.HikariDataSource;
import java.time.Clock;
import java.util.List;
import java.util.Map;
import javax.sql.DataSource;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;

/**
 * {@link WidgetQueryRunner#run} — 정의 없는 저수준 실행(스펙 2026-10-10-user-query-program-design §5).
 * Oracle 시험 PDB({@link McmCoreOraTestDb}, MCMAPUSER)에 시험 전용 표를 만들어 입력 정의 바인드·캐시 없음·행 상한,
 * 시스템 변수(:userId 는 인증 컨텍스트), 예외 정책(값 오류 = BusinessException 그대로, SQL·입력 정의·DB 오류 = {@link WidgetQueryRunException})
 * 을 확인한다. 위젯 경로(runDefinition)의 동작 보존은 {@link WidgetQueryExecutorTest} 가 지킨다.
 */
class WidgetQueryRunnerRunTest {

    private static final String TABLE = "T_C4_USRQ_RUN_T";

    private static HikariDataSource pool;

    private JdbcTemplate jdbc;
    private WidgetUserContextResolver resolver;
    private WidgetQueryExecutor executor;

    @BeforeAll
    static void createTable() {
        pool = McmCoreOraTestDb.appDataSource("widget-query-run");
        JdbcTemplate ddl = new JdbcTemplate(pool);
        dropTable(ddl);
        ddl.execute("CREATE TABLE " + TABLE + " (ID NUMBER(10) PRIMARY KEY, NM VARCHAR2(20), OWNER_ID VARCHAR2(30))");
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
        jdbc.execute("INSERT INTO " + TABLE + " (ID, NM, OWNER_ID)"
                + " SELECT LEVEL, CONCAT('N', LEVEL), CASE WHEN LEVEL <= 3 THEN 'userA' ELSE 'userB' END"
                + " FROM DUAL CONNECT BY LEVEL <= 10");
        resolver = mock(WidgetUserContextResolver.class);
        executor = new WidgetQueryExecutor(mock(WidgetDefRepository.class), resolver,
                WidgetQueryDataSource.shared(pool), Clock.system(WidgetQueryExecutor.ZONE));
    }

    /** 표가 있으면 지운다(ORA-00942 만 무시). */
    private static void dropTable(JdbcTemplate jdbc) {
        jdbc.execute("BEGIN EXECUTE IMMEDIATE 'DROP TABLE " + TABLE + " PURGE'; EXCEPTION WHEN OTHERS THEN IF SQLCODE != -942 THEN RAISE; END IF; END;");
    }

    @Test
    @DisplayName("선언된 입력 조건 값으로 바인드하고 캐시하지 않는다 — 같은 SQL 로 다시 부르면 새 행이 보인다. 행 상한·truncated 는 runDefinition 과 같다")
    void runsWithDeclaredParamsUncached() {
        String sql = "SELECT ID FROM " + TABLE + " WHERE NM = :nm ORDER BY ID";
        String defs = "[{\"name\":\"nm\",\"type\":\"text\"}]";
        WidgetQueryResult r = executor.run(sql, defs, Map.of("nm", "N7"), 5);
        assertThat(r.columns()).containsExactly("ID");
        assertThat(r.rows()).hasSize(1);
        assertThat(((Number) r.rows().get(0).get("ID")).longValue()).isEqualTo(7L);
        assertThat(r.truncated()).isFalse();

        jdbc.update("INSERT INTO " + TABLE + " (ID, NM, OWNER_ID) VALUES (11, 'N7', 'userB')");
        WidgetQueryResult again = executor.run(sql, defs, Map.of("nm", "N7"), 5);
        assertThat(again.rows()).hasSize(2); // 캐시 없음 — 바로 새 행이 보인다

        WidgetQueryResult all = executor.run("SELECT ID FROM " + TABLE + " ORDER BY ID", null, Map.of(), 5);
        assertThat(all.rows()).hasSize(5);
        assertThat(all.truncated()).isTrue();
    }

    @Test
    @DisplayName(":userId 는 인증 컨텍스트에서 얻는다 — 정의가 없어도 시스템 변수는 runDefinition 과 같다")
    void bindsSystemUserIdFromContext() {
        when(resolver.current()).thenReturn(new WidgetUserContext("userA", "userA", null, null, List.of()));
        WidgetQueryResult r = executor.run(
                "SELECT COUNT(*) AS CNT FROM " + TABLE + " WHERE OWNER_ID = :userId", null, Map.of(), 10);
        assertThat(((Number) r.rows().get(0).get("CNT")).longValue()).isEqualTo(3L);
    }

    @Test
    @DisplayName("값 오류는 BusinessException 그대로, SQL·입력 정의·DB 오류는 WidgetQueryRunException(Kind 구분, 안전 문구)으로 나간다")
    void separatesValueErrorsFromSqlAndDbErrors() {
        String defs = "[{\"name\":\"nm\",\"type\":\"text\",\"required\":true}]";
        // 사용자 값 오류 — 필수 누락, 사용자에게 보여도 되는 문구 그대로
        assertThatThrownBy(() -> executor.run("SELECT ID FROM " + TABLE + " WHERE NM = :nm", defs, Map.of(), 5))
                .isInstanceOf(BusinessException.class)
                .hasMessage("입력 조건 nm 의 값을 입력해 주세요.");

        // SQL 검사 오류 — 쓰기 문. DEFINITION, 안전 문구(원인의 SELECT 문구를 담지 않는다)
        assertThatThrownBy(() -> executor.run("UPDATE " + TABLE + " SET NM = 'x'", null, Map.of(), 5))
                .isInstanceOf(WidgetQueryRunException.class)
                .hasMessage("쿼리 정의에 오류가 있습니다. 관리자에게 문의하세요")
                .extracting("kind").isEqualTo(WidgetQueryRunException.Kind.DEFINITION);

        // DB 실행 오류 — 없는 표. EXECUTION, getMessage() 에 ORA·SQL 이 없고 detail() 이 원인을 담는다
        Throwable thrown = catchThrowable(() -> executor.run("SELECT * FROM T_C4_NO_SUCH_RUN_T", null, Map.of(), 5));
        assertThat(thrown).isInstanceOf(WidgetQueryRunException.class)
                .hasMessage("조회하지 못했습니다. 관리자에게 문의하세요");
        assertThat(((WidgetQueryRunException) thrown).kind()).isEqualTo(WidgetQueryRunException.Kind.EXECUTION);
        assertThat(((WidgetQueryRunException) thrown).detail()).contains("ORA-00942");
        assertThat(thrown.getMessage()).doesNotContain("ORA").doesNotContain("SELECT");

        // 입력 정의 오류 — 배열이 아닌 JSON → DEFINITION
        assertThatThrownBy(() -> executor.run("SELECT 1 AS A FROM DUAL", "{\"name\":", Map.of(), 5))
                .isInstanceOf(WidgetQueryRunException.class)
                .hasMessage("쿼리 정의에 오류가 있습니다. 관리자에게 문의하세요")
                .extracting("kind").isEqualTo(WidgetQueryRunException.Kind.DEFINITION);
    }

    @Test
    @DisplayName(":userId 값은 인증 컨텍스트만 믿는다 — 요청 값은 무시된다. 시스템 변수 이름 조건·선언 없는 조건은 DEFINITION 거절")
    void ignoresRequestUserValuesAndSystemNames() {
        when(resolver.current()).thenReturn(new WidgetUserContext("userA", "userA", null, null, List.of()));
        // 요청에 userId=userB 를 실어도 정의에 선언되지 않아 읽히지 않는다 — 인증 컨텍스트(userA)의 3행만 나온다
        WidgetQueryResult r = executor.run(
                "SELECT COUNT(*) AS CNT FROM " + TABLE + " WHERE OWNER_ID = :userId", null, Map.of("userId", "userB"), 10);
        assertThat(((Number) r.rows().get(0).get("CNT")).longValue()).isEqualTo(3L);

        // 입력 정의에 시스템 변수 이름을 쓰면 거절
        assertThatThrownBy(() -> executor.run("SELECT ID FROM " + TABLE + " WHERE OWNER_ID = :userId",
                "[{\"name\":\"userId\",\"type\":\"text\"}]", Map.of(), 5))
                .isInstanceOf(WidgetQueryRunException.class)
                .hasMessage("쿼리 정의에 오류가 있습니다. 관리자에게 문의하세요")
                .extracting("kind").isEqualTo(WidgetQueryRunException.Kind.DEFINITION);

        // SQL 이 쓰는데 정의에 선언되지 않은 조건도 거절
        assertThatThrownBy(() -> executor.run("SELECT ID FROM " + TABLE + " WHERE NM = :foo",
                "[{\"name\":\"nm\",\"type\":\"text\"}]", Map.of("foo", "x"), 5))
                .isInstanceOf(WidgetQueryRunException.class)
                .hasMessage("쿼리 정의에 오류가 있습니다. 관리자에게 문의하세요")
                .extracting("kind").isEqualTo(WidgetQueryRunException.Kind.DEFINITION);
    }

    @Test
    @DisplayName("방언 판정 실패(연결 불가)와 인증 컨텍스트 실패는 EXECUTION — 안전 문구, 원인은 detail 에만")
    void wrapsDialectAndContextFailuresAsExecution() {
        // 연결이 안 되면 갈래 판정이 실패한다 — EXECUTION 으로 감싸고 문구는 안전 문구다(연결 원인은 실행기가 이미 고정 문구로 감쌌다)
        DataSource down = new org.springframework.jdbc.datasource.DelegatingDataSource(pool) {
            @Override
            public java.sql.Connection getConnection() throws java.sql.SQLException {
                throw new java.sql.SQLException("Connection refused: db-host:1521");
            }
        };
        WidgetQueryExecutor downExecutor = new WidgetQueryExecutor(mock(WidgetDefRepository.class), resolver,
                WidgetQueryDataSource.dedicated(down, null), java.time.Clock.system(WidgetQueryExecutor.ZONE));
        Throwable dbDown = catchThrowable(() -> downExecutor.run("SELECT ID FROM " + TABLE, null, Map.of(), 5));
        assertThat(dbDown).isInstanceOf(WidgetQueryRunException.class)
                .hasMessage("조회하지 못했습니다. 관리자에게 문의하세요");
        assertThat(((WidgetQueryRunException) dbDown).kind()).isEqualTo(WidgetQueryRunException.Kind.EXECUTION);
        assertThat(dbDown.getMessage()).doesNotContain("Connection refused");

        // :userId 바인딩 때 사용자 조회가 실패해도 EXECUTION — 원인은 로그(detail)로만
        when(resolver.current()).thenThrow(new IllegalStateException("사용자 조회 실패"));
        Throwable ctx = catchThrowable(() -> executor.run(
                "SELECT COUNT(*) AS CNT FROM " + TABLE + " WHERE OWNER_ID = :userId", null, Map.of(), 5));
        assertThat(ctx).isInstanceOf(WidgetQueryRunException.class)
                .hasMessage("조회하지 못했습니다. 관리자에게 문의하세요");
        assertThat(((WidgetQueryRunException) ctx).kind()).isEqualTo(WidgetQueryRunException.Kind.EXECUTION);
        assertThat(((WidgetQueryRunException) ctx).detail()).contains("사용자 조회 실패");
        assertThat(ctx.getMessage()).doesNotContain("사용자 조회 실패");
    }

    @Test
    @DisplayName("값 형 오류(200자 초과·숫자 아님·선택지 밖)는 BusinessException, maxRows 0·상한 초과는 거절한다")
    void rejectsBadValuesAndMaxRows() {
        String textDefs = "[{\"name\":\"nm\",\"type\":\"text\"}]";
        assertThatThrownBy(() -> executor.run("SELECT ID FROM " + TABLE + " WHERE NM = :nm", textDefs,
                Map.of("nm", "x".repeat(201)), 5))
                .isInstanceOf(BusinessException.class)
                .hasMessage("입력 조건 nm 의 값은 200자 이하여야 합니다.");

        String numDefs = "[{\"name\":\"cnt\",\"type\":\"number\"}]";
        assertThatThrownBy(() -> executor.run("SELECT ID FROM " + TABLE + " WHERE ID = :cnt", numDefs,
                Map.of("cnt", "abc"), 5))
                .isInstanceOf(BusinessException.class)
                .hasMessage("입력 조건 cnt 의 값은 숫자여야 합니다.");

        String selDefs = "[{\"name\":\"nm\",\"type\":\"select\",\"options\":[{\"value\":\"N1\"}]}]";
        assertThatThrownBy(() -> executor.run("SELECT ID FROM " + TABLE + " WHERE NM = :nm", selDefs,
                Map.of("nm", "N9"), 5))
                .isInstanceOf(BusinessException.class)
                .hasMessage("입력 조건 nm 의 값은 선택지 중 하나여야 합니다.");

        assertThatThrownBy(() -> executor.run("SELECT ID FROM " + TABLE, null, Map.of(), 0))
                .isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> executor.run("SELECT ID FROM " + TABLE, null, Map.of(), WidgetQueryRunner.MAX_ROWS + 1))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessageContaining("5000");
    }
}
