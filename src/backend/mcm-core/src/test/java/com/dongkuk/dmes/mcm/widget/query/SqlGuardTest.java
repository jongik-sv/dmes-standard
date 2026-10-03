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
                arguments("SELECT `'` FROM t; SELECT 2 --'", SPECIAL),
                // SQL Server 는 ; 없이 문장을 이어 쓴다 — 읽기 전용 강제가 없는 그 DB 에서 서버 자원을 붙잡거나 바꾸는 문장(2026-10-03)
                arguments("SELECT 1 WAITFOR DELAY '00:00:10'", "쓸 수 없는 낱말이 있습니다: WAITFOR"),
                arguments("SELECT 1 kill 52", "쓸 수 없는 낱말이 있습니다: KILL"),
                arguments("SELECT 1 SHUTDOWN WITH NOWAIT", "쓸 수 없는 낱말이 있습니다: SHUTDOWN"),
                arguments("SELECT 1 DBCC SHRINKDATABASE(0)", "쓸 수 없는 낱말이 있습니다: DBCC"),
                arguments("SELECT 1 RECONFIGURE", "쓸 수 없는 낱말이 있습니다: RECONFIGURE"),
                arguments("SELECT 1 BACKUP DATABASE d TO DISK = 'x'", "쓸 수 없는 낱말이 있습니다: BACKUP"),
                arguments("SELECT 1 RESTORE DATABASE d FROM DISK = 'x'", "쓸 수 없는 낱말이 있습니다: RESTORE"),
                arguments("SELECT 1 DENY SELECT ON t TO public", "쓸 수 없는 낱말이 있습니다: DENY"),
                // Oracle 12c 인라인 PL/SQL(WITH FUNCTION)은 본문에 ; 가 있어야 해서 여러 문장으로 거절된다
                arguments("WITH FUNCTION f RETURN NUMBER IS BEGIN DBMS_SESSION.SLEEP(5); RETURN 1; END; SELECT f FROM dual", MULTI));
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
                // 2차 보안 지적(실 PostgreSQL 재현) — 문자열 SQL 을 실행하는 ts_stat·ts_rewrite, 스키마 접두·따옴표·대소문자·주석 변형
                arguments("SELECT * FROM ts_stat('select to_tsvector(pg_terminate_backend(pid)::text) from pg_stat_activity')",
                        "TS_STAT"),
                arguments("SELECT * FROM pg_catalog.ts_stat('select 1')", "TS_STAT"),
                arguments("SELECT * FROM \"ts_stat\"('select 1')", "TS_STAT"),
                arguments("SELECT * FROM \"pg_catalog\".\"ts_stat\"('select 1')", "TS_STAT"),
                arguments("SELECT * FROM Ts_Stat('select 1')", "TS_STAT"),
                arguments("SELECT * FROM ts_stat/**/('select 1')", "TS_STAT"),
                arguments("SELECT * FROM pg_catalog . ts_stat -- x\n('select 1')", "TS_STAT"),
                arguments("SELECT * FROM [ts_stat]('select 1')", "TS_STAT"),
                arguments("SELECT ts_rewrite('a & b'::tsquery, 'select t, s from aliases')", "TS_REWRITE"),
                arguments("SELECT pg_catalog.TS_REWRITE(q, 'select 1') FROM t", "TS_REWRITE"),
                // 서버 자원 붙잡기 — generate_series 로 권고 잠금을 대량으로 잡으면 공유 메모리 잠금 표가 고갈된다
                arguments("SELECT count(pg_advisory_lock(g)) FROM generate_series(1, 200000) g", "PG_ADVISORY_LOCK"),
                arguments("SELECT pg_advisory_xact_lock_shared(1)", "PG_ADVISORY_XACT_LOCK_SHARED"),
                arguments("SELECT pg_try_advisory_lock(1)", "PG_TRY_ADVISORY_LOCK"),
                arguments("SELECT pg_logical_emit_message(false, 'p', 'x')", "PG_LOGICAL_EMIT_MESSAGE"),
                // 문자열 SQL·XML 질의를 실행하거나 표·스키마·DB 전체를 읽는 함수
                arguments("SELECT table_to_xml('t', true, true, '')", "TABLE_TO_XML"),
                arguments("SELECT schema_to_xml('public', true, true, '')", "SCHEMA_TO_XML"),
                arguments("SELECT database_to_xml_and_xmlschema(true, true, '')", "DATABASE_TO_XML_AND_XMLSCHEMA"),
                arguments("SELECT * FROM xpath_table('id', 'x', 't', '/a', 'true') AS t(id int, a text)", "XPATH_TABLE"),
                arguments("SELECT * FROM crosstab('select 1, 2, 3') AS ct(a int, b int)", "CROSSTAB"),
                arguments("SELECT * FROM public.crosstab3('select 1')", "CROSSTAB3"),
                arguments("SELECT * FROM connectby('t', 'id', 'pid', '1', 0) AS c(id text, pid text, lv int)", "CONNECTBY"),
                arguments("SELECT * FROM pg_background_launch('delete from t')", "PG_BACKGROUND_LAUNCH"),
                // 서버 파일·큰 객체(lo_* 는 열 이름과 겹치지 않게 하나씩 적는다)
                arguments("SELECT pg_read_binary_file('/etc/passwd')", "PG_READ_BINARY_FILE"),
                arguments("SELECT * FROM pg_ls_waldir()", "PG_LS_WALDIR"),
                arguments("SELECT * FROM pg_ls_logdir()", "PG_LS_LOGDIR"),
                arguments("SELECT pg_file_write('x', 'y', false)", "PG_FILE_WRITE"),
                arguments("SELECT lo_create(0)", "LO_CREATE"),
                arguments("SELECT lo_unlink(1)", "LO_UNLINK"),
                arguments("SELECT lo_put(1, 0, 'x')", "LO_PUT"),
                arguments("SELECT lo_from_bytea(0, 'x')", "LO_FROM_BYTEA"),
                arguments("SELECT lowrite(0, 'x')", "LOWRITE"),
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
                arguments("SELECT * FROM [OPENROWSET]('SQLNCLI', 'x', 'select 1')", "OPENROWSET"),
                // Oracle — URI 원격 읽기·XMLTYPE 외부 엔터티·서버 파일·대기·동적 SQL·LDAP·자바·큐
                arguments("SELECT EXTRACTVALUE(XMLTYPE('<!DOCTYPE r [<!ENTITY % x SYSTEM \"http://h/\">%x;]><r/>'), '/r') FROM dual",
                        "XMLTYPE"),
                arguments("SELECT sys.xmltype.createxml('<a/>') FROM dual", "XMLTYPE"),
                arguments("SELECT DBURITYPE('/SCOTT/EMP').GETXML() FROM dual", "DBURITYPE"),
                arguments("SELECT XDBURITYPE('/public/x').GETCLOB() FROM dual", "XDBURITYPE"),
                arguments("SELECT URIFACTORY.GETURI('http://h').GETCLOB() FROM dual", "URIFACTORY"),
                arguments("SELECT BFILENAME('DIR', 'f') FROM dual", "BFILENAME"),
                arguments("SELECT UTL_MAIL.SEND FROM dual", "UTL_MAIL"),
                arguments("SELECT DBMS_SESSION.SLEEP(5) FROM dual", "DBMS_SESSION"),
                arguments("SELECT SYS.DBMS_SYS_SQL.OPEN_CURSOR FROM dual", "DBMS_SYS_SQL"),
                arguments("SELECT DBMS_XMLSTORE.NEWCONTEXT('T') FROM dual", "DBMS_XMLSTORE"),
                arguments("SELECT DBMS_LDAP.INIT('h', 389) FROM dual", "DBMS_LDAP"),
                arguments("SELECT DBMS_JAVA.RUNJAVA('x') FROM dual", "DBMS_JAVA"),
                arguments("SELECT DBMS_AQADM.START_QUEUE FROM dual", "DBMS_AQADM"),
                // SQLite — 토크나이저 포인터
                arguments("SELECT fts3_tokenizer('simple')", "FTS3_TOKENIZER"),
                // SQL Server — 확장 프로시저(접두)·서버 파일 읽기 함수·알려진 위험 저장 프로시저(대괄호 식별자 안도 본다)
                arguments("SELECT * FROM t WHERE 1 = 0 UNION SELECT xp_cmdshell('dir')", "XP_CMDSHELL"),
                arguments("SELECT master..xp_dirtree('\\\\h\\s')", "XP_DIRTREE"),
                arguments("SELECT [master].[dbo].[xp_fileexist]('c:/x')", "XP_FILEEXIST"),
                arguments("SELECT * FROM sys.fn_xe_file_target_read_file('c:/x*.xel', NULL, NULL, NULL)", "FN_XE_FILE_TARGET_READ_FILE"),
                arguments("SELECT * FROM sys.fn_get_audit_file('c:/x*', DEFAULT, DEFAULT)", "FN_GET_AUDIT_FILE"),
                arguments("SELECT * FROM fn_trace_gettable('c:/x.trc', DEFAULT)", "FN_TRACE_GETTABLE"),
                arguments("SELECT * FROM fn_dblog(NULL, NULL)", "FN_DBLOG"),
                // 저장 프로시저는 괄호 없이 부르므로 부르는 모양을 따지지 않고 낱말만으로 거절한다
                arguments("SELECT 1 sp_executesql N'select 1'", "SP_EXECUTESQL"),
                arguments("SELECT 1 FROM t WHERE x = [sp_oacreate]", "SP_OACREATE"),
                // 3차 보안 리뷰(2026-10-03) — 이름 뒤에 ( · . · @ 가 오면 부르는 것이다. 공백·주석·유니코드 공백·서식 글자를 끼워도 걸린다
                arguments("SELECT (ts_stat('select 1')).*", "TS_STAT"),
                arguments("SELECT * FROM ts_stat\u00A0('select 1')", "TS_STAT"),
                arguments("SELECT * FROM ts_stat\u3000('select 1')", "TS_STAT"),
                arguments("SELECT * FROM ts_stat\u200B('select 1')", "TS_STAT"),
                arguments("SELECT * FROM ts_stat\t\r\n('select 1')", "TS_STAT"),
                arguments("SELECT * FROM ts_stat /* a */ -- b\n /* c */ ('select 1')", "TS_STAT"),
                arguments("SELECT DBMS_LOCK . SLEEP(5) FROM dual", "DBMS_LOCK"),
                arguments("SELECT DBMS_SESSION.UNIQUE_SESSION_ID FROM dual", "DBMS_SESSION"),
                arguments("SELECT BFILENAME@remote_link('D', 'f') FROM dual", "BFILENAME"),
                arguments("SELECT xp_cmdshell ('dir')", "XP_CMDSHELL"),
                arguments("SELECT XMLTYPE.CREATEXML('<a/>') FROM dual", "XMLTYPE"),
                // 같은 SQL 에 열 이름으로 먼저 나오고 뒤에서 부르면 뒤의 호출이 걸린다
                arguments("SELECT xmltype, XMLTYPE('<a/>') FROM t", "XMLTYPE"));
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
                arguments("SELECT [lo_cd], [dblinkx] FROM t"),
                // 2차 목록과 이름 일부만 같은 열·리터럴 안 이름(lo_·sp_ 는 접두로 막지 않는다)
                arguments("SELECT lo_cd, sp_cd, ts_stat_cd, ts_stat_yn, xml_type, crosstab_yn, kill_cnt, backup_yn FROM t"),
                arguments("SELECT 'ts_stat(''select 1'')', 'xp_cmdshell' FROM t"),
                arguments("SELECT current_setting('TimeZone')"),
                // 3차 보안 리뷰(2026-10-03) — 거절 목록과 같은 이름이어도 부르지 않는 열·표·별칭은 통과한다
                arguments("SELECT XMLTYPE FROM T"),
                arguments("SELECT XP_CNT, xp_yn FROM TB_EQP"),
                arguments("SELECT CNT FROM XP_HIST"),
                arguments("SELECT h.XP_CNT FROM XP_HIST h WHERE h.XP_CNT > 0"),
                arguments("SELECT 1 AS \"xmltype\", 2 AS \"ts_stat\" FROM T"),
                arguments("SELECT dblink, ts_stat, crosstab, bfilename FROM t ORDER BY dblink"),
                arguments("SELECT t.ts_stat FROM t"));
    }

    /**
     * 함수 거절 목록이 평범한 집계를 막지 않는지 — 로컬 DB 에 저장된 화면 사용 통계 위젯 SQL 과 그 모양의 방언별 SQL.
     * 방언별 집계·서식·널 처리 함수(COUNT·SUM·ROUND·TO_CHAR·COALESCE·NVL·DECODE·CASE·창 함수·문자열 집계·DBMS_LOB)를 섞는다.
     */
    static Stream<Arguments> realWidgetQueries() {
        return Stream.of(
                // 로컬 DB(TB_MCM_WIDGET_DEF)에 저장된 쿼리 위젯 정의 5개 그대로(2026-10-03) — 저장된 정의는 실행 때마다 다시 검사한다
                // def.lo41tduo
                arguments("SELECT COALESCE(o.OBJECT_NM, l.PAGE_ID) AS SCREEN_NM,\n"
                        + "       ROUND(SUM(l.DURATION_MS) / 60000.0, 1) AS USE_MIN,\n"
                        + "       COUNT(*) AS OPEN_CNT\n"
                        + "  FROM TB_SEC_SCREEN_USAGE_LOG l\n"
                        + "  LEFT JOIN TB_MCM_SEC_OBJ o\n"
                        + "    ON o.OBJECT_ID = SUBSTR(l.PAGE_ID, INSTR(l.PAGE_ID, '/') + 1)\n"
                        + " WHERE l.STARTED_AT >= DATE('now', 'localtime', '-6 day')\n"
                        + " GROUP BY COALESCE(o.OBJECT_NM, l.PAGE_ID)\n"
                        + " ORDER BY USE_MIN DESC\n"
                        + " LIMIT 10"),
                // def.fpkt65d4
                arguments("SELECT '사용 시간' AS LABEL, ROUND(COALESCE(SUM(DURATION_MS), 0) / 60000.0, 1) AS VAL, '분' AS UNIT\n"
                        + "  FROM TB_SEC_SCREEN_USAGE_LOG WHERE STARTED_AT >= DATE('now', 'localtime')\n"
                        + "UNION ALL\n"
                        + "SELECT '사용자', COUNT(DISTINCT USER_ID), '명'\n"
                        + "  FROM TB_SEC_SCREEN_USAGE_LOG WHERE STARTED_AT >= DATE('now', 'localtime')\n"
                        + "UNION ALL\n"
                        + "SELECT '연 화면', COUNT(DISTINCT PAGE_ID), '개'\n"
                        + "  FROM TB_SEC_SCREEN_USAGE_LOG WHERE STARTED_AT >= DATE('now', 'localtime')\n"
                        + "UNION ALL\n"
                        + "SELECT '열람 횟수', COUNT(*), '회'\n"
                        + "  FROM TB_SEC_SCREEN_USAGE_LOG WHERE STARTED_AT >= DATE('now', 'localtime')"),
                // def.ldj2hpgw
                arguments("SELECT SUBSTR(l.STARTED_AT, 1, 16) AS STARTED,\n"
                        + "       COALESCE(o.OBJECT_NM, l.PAGE_ID) AS SCREEN_NM,\n"
                        + "       ROUND(l.DURATION_MS / 1000.0) AS SEC\n"
                        + "  FROM TB_SEC_SCREEN_USAGE_LOG l\n"
                        + "  LEFT JOIN TB_MCM_SEC_OBJ o\n"
                        + "    ON o.OBJECT_ID = SUBSTR(l.PAGE_ID, INSTR(l.PAGE_ID, '/') + 1)\n"
                        + " WHERE l.USER_ID = :userId\n"
                        + " ORDER BY l.STARTED_AT DESC\n"
                        + " LIMIT 20"),
                // def.ubb8dih0
                arguments("SELECT SUBSTR(STARTED_AT, 6, 5) AS DAY,\n"
                        + "       ROUND(SUM(DURATION_MS) / 60000.0, 1) AS USE_MIN\n"
                        + "  FROM TB_SEC_SCREEN_USAGE_LOG\n"
                        + " WHERE STARTED_AT >= DATE('now', 'localtime', '-13 day')\n"
                        + " GROUP BY SUBSTR(STARTED_AT, 1, 10)\n"
                        + " ORDER BY SUBSTR(STARTED_AT, 1, 10)"),
                // def.spzufhgo
                arguments("SELECT CASE o.SYSTEM_CODE WHEN 'mcm' THEN '공통관리' WHEN 'mdm' THEN '마루 MDM' ELSE COALESCE(o.SYSTEM_CODE, '기타') END AS AREA,\n"
                        + "       ROUND(SUM(l.DURATION_MS) / 60000.0, 1) AS USE_MIN\n"
                        + "  FROM TB_SEC_SCREEN_USAGE_LOG l\n"
                        + "  LEFT JOIN TB_MCM_SEC_OBJ o\n"
                        + "    ON o.OBJECT_ID = SUBSTR(l.PAGE_ID, INSTR(l.PAGE_ID, '/') + 1)\n"
                        + " WHERE l.STARTED_AT >= DATE('now', 'localtime', '-29 day')\n"
                        + " GROUP BY 1\n"
                        + " ORDER BY 2 DESC"),
                // 방언별 집계·서식 함수를 섞은 사례
                arguments("SELECT PAGE_ID, COUNT(DISTINCT USER_ID) AS USER_CNT, SUM(OPEN_CNT) AS OPEN_CNT,\n"
                        + "       ROUND(SUM(DURATION_MS) / 60000.0, 1) AS \"사용 시간(분)\"\n"
                        + "  FROM MCMAPUSER.TB_SEC_SCREEN_USAGE_DAY\n"
                        + " WHERE USAGE_DT >= :monthStart AND USAGE_DT <= :today\n"
                        + " GROUP BY PAGE_ID\n"
                        + " ORDER BY OPEN_CNT DESC"),
                arguments("WITH d AS (\n"
                        + "  SELECT USAGE_DT, COALESCE(NULLIF(DEPT_CD, ''), '-') AS DEPT_CD, SUM(SEG_CNT) AS SEG_CNT, SUM(DURATION_MS) AS MS\n"
                        + "    FROM TB_SEC_SCREEN_USAGE_DAY WHERE USAGE_DT BETWEEN :monthStart AND :yesterday GROUP BY USAGE_DT, DEPT_CD)\n"
                        + "SELECT TO_CHAR(TO_DATE(USAGE_DT, 'YYYYMMDD'), 'MM-DD') AS \"일자\", DEPT_CD,\n"
                        + "       CASE WHEN SEG_CNT = 0 THEN 0 ELSE ROUND(MS / SEG_CNT / 1000.0, 1) END AS AVG_SEC,\n"
                        + "       ROW_NUMBER() OVER (PARTITION BY USAGE_DT ORDER BY MS DESC) AS RN,\n"
                        + "       CAST(SUM(MS) OVER () AS NUMERIC(18, 0)) AS TOTAL_MS\n"
                        + "  FROM d ORDER BY USAGE_DT;"),
                arguments("SELECT NVL(DEPT_CD, '-') DEPT_CD, DECODE(SIGN(SUM(OPEN_CNT) - 10), 1, 'HIGH', 'LOW') LV,\n"
                        + "       LISTAGG(PAGE_ID, ',') WITHIN GROUP (ORDER BY PAGE_ID) PAGES, TRUNC(SYSDATE) - 1 BASE_DT,\n"
                        + "       RTRIM(XMLAGG(XMLELEMENT(E, USER_ID || ',')).EXTRACT('//text()'), ',') USERS,\n"
                        + "       DBMS_LOB.SUBSTR(MAX(NOTE), 100, 1) NOTE\n"
                        + "  FROM MCMAPUSER.TB_SEC_SCREEN_USAGE_DAY WHERE USER_ID = :userId AND DEPT_CD = :deptCd\n"
                        + " GROUP BY DEPT_CD"),
                arguments("SELECT STRING_AGG(PAGE_ID, ',' ORDER BY PAGE_ID) AS PAGES, EXTRACT(DOW FROM CURRENT_DATE) AS DOW,\n"
                        + "       DATE_TRUNC('day', :now) AS BASE_TS, SUBSTR(MAX(USAGE_DT), 1, 6) AS YM, COUNT(*) FILTER (WHERE OPEN_CNT > 0) AS N\n"
                        + "  FROM TB_SEC_SCREEN_USAGE_DAY"));
    }

    @ParameterizedTest(name = "[{index}]")
    @MethodSource("realWidgetQueries")
    @DisplayName("화면 사용 통계 같은 실제 집계 SQL 은 함수 거절 목록에 걸리지 않는다")
    void allowsRealWidgetQueries(String sql) {
        assertThat(SqlGuard.check(sql).sql()).isEqualTo(sql.strip().replaceAll(";$", ""));
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
