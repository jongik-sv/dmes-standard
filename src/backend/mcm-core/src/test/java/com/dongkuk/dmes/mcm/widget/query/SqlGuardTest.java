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
    private static final String SPECIAL = "특수 문자열 표기(E'…', q'…', $$…$$)는 쓸 수 없습니다";

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
                arguments("SELECT [update] FROM t", "SELECT [update] FROM t", List.of()),
                arguments("Select :yesterday, :now; -- 끝", "Select :yesterday, :now -- 끝", List.of("yesterday", "now")));
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
                arguments("(SELECT 1)", NOT_SELECT));
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
