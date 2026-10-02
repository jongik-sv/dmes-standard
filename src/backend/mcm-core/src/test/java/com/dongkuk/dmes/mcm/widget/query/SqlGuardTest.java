package com.dongkuk.dmes.mcm.widget.query;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.junit.jupiter.params.provider.Arguments.arguments;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import java.util.List;
import java.util.stream.Stream;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.Arguments;
import org.junit.jupiter.params.provider.MethodSource;

/**
 * {@link SqlGuard} — 스펙 2026-10-02-widget-admin-generic §7.1 사례 표(Review Focus 2: 주석·문자열 안 ;, SELECT … INTO,
 * FOR UPDATE, PostgreSQL ::text, 대소문자 섞인 금지어, 리터럴 안 :time).
 * 따옴표·쉼표가 섞인 SQL 이라 @CsvSource 대신 @MethodSource 를 쓴다.
 */
class SqlGuardTest {

    private static final String NOT_SELECT = "SELECT 또는 WITH 로 시작하는 조회문만 쓸 수 있습니다";
    private static final String MULTI = "문장은 하나만 쓸 수 있습니다";
    private static final String EMPTY = "SQL 을 입력해 주세요";
    private static final String UNCLOSED = "닫히지 않은 따옴표·괄호·주석이 있습니다";
    private static final String SPECIAL = "특수 문자열 표기(E'…', q'…', $$…$$, `…`, U&\"…\")는 쓸 수 없습니다";
    private static final String NESTED = "주석 안에 /* 를 다시 쓸 수 없습니다(DB 마다 겹친 주석을 다르게 읽습니다)";

    /** 원문 → 실행할 SQL(끝 ; 만 지우고 앞뒤 공백 정리) → 쓰인 변수(처음 나온 순서, 중복 없음). */
    static Stream<Arguments> allowed() {
        return Stream.of(
                arguments("SELECT 1", "SELECT 1", List.of()),
                arguments("select * from t where a = :userId", "select * from t where a = :userId", List.of("userId")),
                arguments("WITH x AS (SELECT 1 a) SELECT a FROM x", "WITH x AS (SELECT 1 a) SELECT a FROM x", List.of()),
                arguments("SELECT 1;", "SELECT 1", List.of()),
                arguments("SELECT col::text FROM t", "SELECT col::text FROM t", List.of()),
                arguments("SELECT 'a;b' FROM t", "SELECT 'a;b' FROM t", List.of()),
                arguments("SELECT '10:30' FROM t", "SELECT '10:30' FROM t", List.of()),
                arguments("SELECT 1 -- ; drop\n", "SELECT 1 -- ; drop", List.of()),
                arguments("SELECT /* update */ 1", "SELECT /* update */ 1", List.of()),
                arguments("SELECT \"update\" FROM t", "SELECT \"update\" FROM t", List.of()),
                // 덧붙인 사례: '' 이스케이프·여러 변수·끝 공백·식별자 안 금지어 조각·[식별자](SQLite·MSSQL)·Oracle $ 식별자
                arguments("SELECT 'it''s; :now' FROM t WHERE d >= :monthStart AND d < :today",
                        "SELECT 'it''s; :now' FROM t WHERE d >= :monthStart AND d < :today", List.of("monthStart", "today")),
                arguments("  select :userId, :userId , :deptCd::text ;  ", "select :userId, :userId , :deptCd::text",
                        List.of("userId", "deptCd")),
                arguments("SELECT updated_at, created_by, deleted_yn FROM v$session", "SELECT updated_at, created_by, deleted_yn FROM v$session",
                        List.of()),
                arguments("Select :yesterday, :now; -- 끝", "Select :yesterday, :now -- 끝", List.of("yesterday", "now")),
                // 1차 리뷰 뒤 덧붙인 사례: PostgreSQL 배열 첨자·띄어 쓴 비트 연산 &·주석 두 개·Spring 이 바인딩하는 &name
                arguments("SELECT a[1] FROM t", "SELECT a[1] FROM t", List.of()),
                arguments("SELECT a & b FROM t", "SELECT a & b FROM t", List.of()),
                arguments("SELECT 1 -- x\r\nFROM t", "SELECT 1 -- x\r\nFROM t", List.of()),
                arguments("SELECT 1 /* a */ /* b */ FROM t", "SELECT 1 /* a */ /* b */ FROM t", List.of()),
                arguments("SELECT 1 FROM t WHERE a = &userId", "SELECT 1 FROM t WHERE a = &userId", List.of("userId")));
    }

    @ParameterizedTest(name = "[{index}] {0}")
    @MethodSource("allowed")
    @DisplayName("정상 조회문은 통과하고 실행할 SQL·쓰인 변수를 돌려준다")
    void allows(String sql, String cleaned, List<String> variables) {
        SqlGuard.Validated v = SqlGuard.check(sql);
        assertThat(v.sql()).isEqualTo(cleaned);
        assertThat(v.variables()).containsExactlyElementsOf(variables);
    }

    static Stream<Arguments> rejected() {
        return Stream.of(
                arguments("UPDATE t SET a=1", NOT_SELECT),
                arguments("SELECT 1; SELECT 2", MULTI),
                arguments("select * into x from t", "쓸 수 없는 낱말이 있습니다: INTO"),
                arguments("SELECT * FROM t FOR UPDATE", "쓸 수 없는 낱말이 있습니다: UPDATE"),
                arguments("DeLeTe FROM t", NOT_SELECT),
                arguments("SELECT 1; DROP TABLE t", MULTI),
                arguments("PRAGMA x", NOT_SELECT),
                arguments("select :foo",
                        "알 수 없는 변수입니다: :foo (쓸 수 있는 변수: :userId, :deptCd, :today, :yesterday, :monthStart, :now)"),
                arguments("EXEC p", NOT_SELECT),
                arguments("", EMPTY),
                arguments("   ", EMPTY),
                arguments("SELECT 1;;", MULTI),
                // 덧붙인 사례: 쓰기 CTE·대소문자 섞인 금지어·닫히지 않은 따옴표·특수 문자열로 검사 우회
                arguments("WITH d AS (DELETE FROM t RETURNING *) SELECT * FROM d", "쓸 수 없는 낱말이 있습니다: DELETE"),
                arguments("SELECT a FROM t WHERE b IN (SELECT c FROM u) uNiOn SELECT 1 FROM t fOr UpDaTe", "쓸 수 없는 낱말이 있습니다: UPDATE"),
                arguments("SELECT 1 FROM t; dRoP TABLE t", MULTI),
                arguments("SELECT 'abc FROM t", UNCLOSED),
                arguments("SELECT /* 1", UNCLOSED),
                arguments("SELECT \"a FROM t", UNCLOSED),
                arguments("SELECT $$ ' $$, 1; DROP TABLE t; --'", SPECIAL),
                arguments("SELECT E'\\''; DROP TABLE t; --'", SPECIAL),
                arguments("SELECT q'[ ' ]' FROM t FOR UPDATE --'", SPECIAL),
                arguments("SELECT ['] FROM t; DELETE FROM t; --']", MULTI),
                arguments("SELECT :userid FROM t",
                        "알 수 없는 변수입니다: :userid (쓸 수 있는 변수: :userId, :deptCd, :today, :yesterday, :monthStart, :now)"),
                arguments("(SELECT 1)", NOT_SELECT),
                // 1차 리뷰 뒤 덧붙인 사례 — 겹친 주석(PostgreSQL·MSSQL 과 Oracle·SQLite 가 다르게 읽는다)
                arguments("SELECT 1 /* a /* b */ */", NESTED),
                arguments("SELECT 1 /* x /* y */", NESTED),
                arguments("SELECT 1 /* x /*/ FROM t", NESTED),
                // 대괄호는 PostgreSQL 에서 식이다 — 그 안의 ;·금지 낱말·변수도 본다
                arguments("SELECT [a;b] FROM t", MULTI),
                arguments("SELECT [update] FROM t", "쓸 수 없는 낱말이 있습니다: UPDATE"),
                arguments("SELECT a[:foo] FROM t",
                        "알 수 없는 변수입니다: :foo (쓸 수 있는 변수: :userId, :deptCd, :today, :yesterday, :monthStart, :now)"),
                // Spring 이 변수로 바꾸는 &name·점 붙은 이름도 같은 규칙(검사는 통과하고 실행 때 늘 실패하는 SQL 을 막는다)
                arguments("SELECT a FROM t WHERE (f &mask) = 1",
                        "알 수 없는 변수입니다: &mask (쓸 수 있는 변수: :userId, :deptCd, :today, :yesterday, :monthStart, :now)"),
                arguments("SELECT :userId.x FROM t",
                        "알 수 없는 변수입니다: :userId.x (쓸 수 있는 변수: :userId, :deptCd, :today, :yesterday, :monthStart, :now)"),
                arguments("SELECT :{userId} FROM t",
                        "알 수 없는 변수입니다: :{userId} (쓸 수 있는 변수: :userId, :deptCd, :today, :yesterday, :monthStart, :now)"),
                // 방언마다 경계가 갈리는 표기 — 대괄호 식별자 안 ]](MSSQL 만 이스케이프)·줄 주석 안 홀로 \r
                arguments("SELECT [a]] FROM t", SqlGuard.MSG_BRACKET_ESCAPE),
                arguments("SELECT 1 -- x\r' \n; DELETE FROM t ; '", SqlGuard.MSG_LONE_CR),
                // 백틱은 SQLite·Spring 만 따옴표로 읽는다 — 리터럴 경계가 갈리지 않게 받지 않는다
                arguments("SELECT `a` FROM t", SPECIAL),
                arguments("SELECT `'` FROM t; SELECT 2 --'", SPECIAL));
    }

    @ParameterizedTest(name = "[{index}] {0}")
    @MethodSource("rejected")
    @DisplayName("쓰기·여러 문장·모르는 변수·우회 표기는 INVALID_VALUE 로 거절한다")
    void rejects(String sql, String message) {
        assertThatThrownBy(() -> SqlGuard.check(sql))
                .isInstanceOf(BusinessException.class)
                .hasMessage(message)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));
    }

    /** 6단계 — 읽기 전용 트랜잭션이 막지 못하는 함수(2026-10-03 보안 지적). 원문 → 메시지에 실릴 함수 이름. */
    static Stream<Arguments> forbiddenFunctions() {
        return Stream.of(
                // PostgreSQL
                arguments("SELECT pg_terminate_backend(123)", "PG_TERMINATE_BACKEND"),
                arguments("SELECT pg_cancel_backend(pid) FROM pg_stat_activity", "PG_CANCEL_BACKEND"),
                arguments("SELECT pg_catalog.pg_advisory_lock(1)", "PG_ADVISORY_LOCK"),
                arguments("SELECT pg_try_advisory_xact_lock(1)", "PG_TRY_ADVISORY_XACT_LOCK"),
                arguments("SELECT pg_sleep(10)", "PG_SLEEP"),
                arguments("SELECT pg_sleep_for('5 minutes')", "PG_SLEEP_FOR"),
                arguments("SELECT set_config('search_path', 'x', false)", "SET_CONFIG"),
                arguments("SELECT pg_notify('ch', 'x')", "PG_NOTIFY"),
                arguments("SELECT pg_read_file('/etc/passwd')", "PG_READ_FILE"),
                arguments("SELECT pg_ls_dir('.')", "PG_LS_DIR"),
                arguments("SELECT lo_import('/etc/passwd')", "LO_IMPORT"),
                arguments("SELECT lo_export(1, '/tmp/x')", "LO_EXPORT"),
                arguments("SELECT * FROM dblink('host=x', 'select 1') AS t(a int)", "DBLINK"),
                arguments("SELECT dblink_exec('host=x', 'drop table t')", "DBLINK_EXEC"),
                // 리터럴 안 SQL 은 가린 사본에서 안 보이지만 바깥 함수 이름이 걸린다
                arguments("SELECT query_to_xml('select pg_terminate_backend(1)', true, true, '')", "QUERY_TO_XML"),
                arguments("SELECT query_to_xml_and_xmlschema('select 1', true, true, '')", "QUERY_TO_XML_AND_XMLSCHEMA"),
                arguments("SELECT cursor_to_xml('c', 1, true, true, '')", "CURSOR_TO_XML"),
                // 따옴표 식별자·유니코드 아닌 대소문자 섞기로 불러도 걸린다
                arguments("SELECT \"pg_sleep\"(10)", "PG_SLEEP"),
                arguments("SELECT \"pg_catalog\".\"pg_terminate_backend\"(1)", "PG_TERMINATE_BACKEND"),
                arguments("SELECT Pg_Sleep(1)", "PG_SLEEP"),
                // Oracle
                arguments("SELECT UTL_HTTP.REQUEST('http://x') FROM dual", "UTL_HTTP"),
                arguments("SELECT utl_tcp.open_connection('x', 80) FROM dual", "UTL_TCP"),
                arguments("SELECT UTL_SMTP.OPEN_CONNECTION('x') FROM dual", "UTL_SMTP"),
                arguments("SELECT UTL_FILE.FOPEN('D', 'f', 'r') FROM dual", "UTL_FILE"),
                arguments("SELECT UTL_INADDR.GET_HOST_ADDRESS('x') FROM dual", "UTL_INADDR"),
                arguments("SELECT HTTPURITYPE('http://x').GETCLOB() FROM dual", "HTTPURITYPE"),
                arguments("SELECT SYS.DBMS_LOCK.SLEEP(5) FROM dual", "DBMS_LOCK"),
                arguments("SELECT DBMS_PIPE.RECEIVE_MESSAGE('p', 10) FROM dual", "DBMS_PIPE"),
                arguments("SELECT DBMS_ALERT.WAITONE('a', m, s, 10) FROM dual", "DBMS_ALERT"),
                arguments("SELECT DBMS_SCHEDULER.GENERATE_JOB_NAME FROM dual", "DBMS_SCHEDULER"),
                arguments("SELECT DBMS_JOB.SUBMIT FROM dual", "DBMS_JOB"),
                arguments("SELECT DBMS_SQL.OPEN_CURSOR FROM dual", "DBMS_SQL"),
                arguments("SELECT DBMS_XMLGEN.GETXML('select 1 from dual') FROM dual", "DBMS_XMLGEN"),
                arguments("SELECT DBMS_XMLQUERY.GETXML('select 1 from dual') FROM dual", "DBMS_XMLQUERY"),
                arguments("SELECT \"SYS\".\"DBMS_LOCK\".\"SLEEP\"(5) FROM dual", "DBMS_LOCK"),
                // SQLite·SQL Server(대괄호 식별자 안도 본다)
                arguments("SELECT load_extension('x')", "LOAD_EXTENSION"),
                arguments("SELECT * FROM OPENROWSET('SQLNCLI', 'x', 'select 1')", "OPENROWSET"),
                arguments("SELECT * FROM OPENDATASOURCE('SQLNCLI', 'x').db.dbo.t", "OPENDATASOURCE"),
                arguments("SELECT * FROM OPENQUERY(srv, 'select 1')", "OPENQUERY"),
                arguments("SELECT * FROM [OPENROWSET]('SQLNCLI', 'x', 'select 1')", "OPENROWSET"));
    }

    @ParameterizedTest(name = "[{index}] {0}")
    @MethodSource("forbiddenFunctions")
    @DisplayName("부수효과·외부 통신·리터럴 안 SQL 실행 함수는 INVALID_VALUE 로 거절한다")
    void rejectsForbiddenFunctions(String sql, String name) {
        assertThatThrownBy(() -> SqlGuard.check(sql))
                .isInstanceOf(BusinessException.class)
                .hasMessage(SqlGuard.MSG_FORBIDDEN_FUNCTION + name)
                .satisfies(e -> assertThat(((BusinessException) e).getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE));
    }

    @Test
    @DisplayName("PostgreSQL 유니코드 식별자 U&\"…\" 는 이스케이프로 함수 이름을 숨길 수 있어 거절한다")
    void rejectsUnicodeIdentifier() {
        assertThatThrownBy(() -> SqlGuard.check("SELECT U&\"\\0070g_sleep\"(10)")).hasMessage(SPECIAL);
        assertThatThrownBy(() -> SqlGuard.check("SELECT u&\"x\" FROM t")).hasMessage(SPECIAL);
    }

    static Stream<Arguments> allowedNearFunctions() {
        return Stream.of(
                // DBMS_ 전체를 막지 않는다 — 평범한 CLOB 조회
                arguments("SELECT DBMS_LOB.SUBSTR(note, 100, 1) FROM t"),
                arguments("SELECT DBMS_LOB.GETLENGTH(note) FROM t"),
                // 이름 일부만 같은 식별자·리터럴 안 이름·비트 연산 & 뒤 따옴표 식별자는 통과
                arguments("SELECT sleep_cnt, lock_yn, xml_data, utl_http_log FROM t"),
                arguments("SELECT \"utl_http_log\", \"update\" FROM t"),
                arguments("SELECT 'pg_sleep(10)', 'UTL_HTTP' FROM t"),
                arguments("SELECT a &\"b\" FROM t"),
                arguments("SELECT [lo_cd], [dblinkx] FROM t"));
    }

    @ParameterizedTest(name = "[{index}] {0}")
    @MethodSource("allowedNearFunctions")
    @DisplayName("거절 목록과 이름 일부만 같은 정상 조회는 통과한다")
    void allowsNearFunctions(String sql) {
        assertThat(SqlGuard.check(sql).sql()).isEqualTo(sql);
    }

    @Test
    @DisplayName("null 은 빈 SQL 과 같이 거절한다")
    void rejectsNull() {
        assertThatThrownBy(() -> SqlGuard.check(null)).isInstanceOf(BusinessException.class).hasMessage(EMPTY);
    }

    @Test
    @DisplayName("시스템 변수 목록은 스펙 §7.2 순서다")
    void systemVariables() {
        assertThat(SqlGuard.SYSTEM_VARIABLES).containsExactly("userId", "deptCd", "today", "yesterday", "monthStart", "now");
    }
}
