package com.dongkuk.dmes.mcm.widget.query;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 쿼리 위젯 SQL 검사(스펙 2026-10-02-widget-admin-generic §7.1) — 저장·미리보기·실행이 모두 이 검사를 거친다.
 * <ol>
 *   <li>문자열 리터럴({@code '…'}, {@code ''} 이스케이프), 따옴표 식별자({@code "…"}), 주석({@code --} 줄, {@code /* *&#47;})을
 *       <b>같은 길이의 공백으로 가린 사본</b>을 만든다. 판단은 늘 가린 사본으로 한다.</li>
 *   <li>첫 낱말이 SELECT 또는 WITH 여야 한다.</li>
 *   <li>끝의 {@code ;} 하나만 허용(여러 문장 금지).</li>
 *   <li>쓰기·DDL·권한·트랜잭션 낱말은 단어 경계·대소문자 무시로 거절({@code SELECT … INTO}, {@code FOR UPDATE} 포함).
 *       SQL Server 가 {@code ;} 없이 이어 쓸 수 있는 서버 문장({@code WAITFOR}·{@code KILL}·{@code SHUTDOWN} 등)과 T-SQL 흐름·세션 문장
 *       ({@code USE}·{@code DECLARE}·{@code WHILE}·{@code BEGIN} 등)도 여기서 막는다. {@code SET}·{@code IF} 는 Oracle {@code SET()}·SQLite
 *       {@code if()} 함수와 겹쳐 실행 DB 가 SQL Server 일 때만 막는다({@link #check(String, WidgetReadOnlyJdbc.Dialect)}).</li>
 *   <li>이름 붙은 변수({@code :name}·{@code &name}, PostgreSQL {@code ::} 캐스트 제외)는 §7.2 시스템 변수만.
 *       Spring {@code NamedParameterJdbcTemplate} 은 {@code &name} 도 변수로 바꾸므로 같은 규칙으로 본다.</li>
 * </ol>
 * <b>대괄호 {@code […]} 는 방언마다 뜻이 다르다</b> — SQLite·MSSQL 은 식별자, PostgreSQL·Oracle·H2 와 Spring 변수 해석은
 * 식(배열 첨자)으로 읽는다. 그래서 가린 사본을 두 벌(대괄호를 식별자로 가린 것·식으로 둔 것) 만들어 2~5단계를
 * <b>두 사본 모두</b>에 적용하고, 어느 한쪽이라도 어기면 거절한다. 실제로 바인딩할 변수는 Spring 과 같은 해석(식으로 둔 사본)에서 얻는다.
 * 식별자 안의 {@code ]]} 는 MSSQL 만 글자 하나(이스케이프)로 읽고 SQLite 는 거기서 식별자를 닫으므로, 식별자 경계가 갈리는 표기라 받지 않는다.
 * 줄 주석({@code --})은 {@code \n} 에서 끝나는 것으로 보고, 뒤에 {@code \n} 이 따르지 않는 {@code \r} 도 받지 않는다
 * (DB 마다 {@code \r} 만으로 주석이 끝나는지가 다르다).
 * <p>
 * 방언마다 따옴표·주석 규칙이 달라 검사가 보는 코드와 DB 가 보는 코드가 어긋날 수 있는 표기(PostgreSQL {@code E'…'}·{@code $$…$$},
 * Oracle {@code q'…'}, SQLite 백틱 식별자, 주석 안의 {@code /*} — PostgreSQL·MSSQL 은 주석을 겹쳐 열고 Oracle·SQLite 는 아니다)는
 * 아예 받지 않는다.
 * 닫히지 않은 따옴표·괄호·주석도 거절한다.
 * 실행할 SQL 은 가린 사본이 아니라 <b>원문</b>에서 끝 {@code ;} 만 지운 것이다(리터럴을 살려야 하므로). 감싸지 않고 그대로 실행한다.
 * 이 검사가 1차 방어선이고, 실행기의 읽기 전용·늘 롤백 트랜잭션이 2차 방어선이다(§7.3).
 * <p>
 * <b>함수 거절 목록</b>(§7.1 6단계, 2026-10-03 보안 지적): 읽기 전용 트랜잭션이 막지 못하는 부수효과·외부 통신·문자열 SQL 실행 함수
 * (세션 종료·권고 잠금·대기, dblink, 서버 파일, {@code ts_stat}·{@code query_to_xml}·{@code DBMS_XMLGEN} 처럼 리터럴 안 SQL 을 실행하는 함수,
 * Oracle 네트워크·잠금·작업 패키지, SQLite 확장 적재, MSSQL 외부 행 집합)를 <b>부르는 모양</b>일 때 거절한다 — 이름 뒤에 공백·주석을
 * 건너뛰고 {@code (}·{@code .}(Oracle 패키지 {@code DBMS_X.F})·{@code @}(Oracle DB 링크)가 올 때만이다. 그래서 같은 이름의 열·표·별칭
 * ({@code SELECT XMLTYPE FROM T}, {@code XP_CNT}, {@code FROM XP_HIST})은 통과한다. 따옴표 식별자로 불러도
 * ({@code "pg_sleep"(1)}) 걸리도록 이 단계만은 따옴표·대괄호 식별자 안 글자를 드러낸 사본으로 본다. PostgreSQL 유니코드 식별자
 * {@code U&"…"} 는 이스케이프로 이름을 숨길 수 있어 받지 않는다. 이름 목록은 <b>보조</b>일 뿐이다(확장·새 판이 문자열 SQL 을 실행하는
 * 함수를 더할 수 있다). 운영에서는 실행기에 읽기 권한만 가진 DB 계정의 DataSource({@code dmes.widget.query.datasource.*})를
 * <b>반드시</b> 붙인다({@link WidgetQueryExecutor} 운영 주의).
 */
public final class SqlGuard {

    /** §7.2 시스템 변수 — 안내 문구·검사 순서. */
    public static final List<String> SYSTEM_VARIABLES = List.of("userId", "deptCd", "today", "yesterday", "monthStart", "now");

    static final String MSG_EMPTY = "SQL 을 입력해 주세요";
    static final String MSG_NOT_SELECT = "SELECT 또는 WITH 로 시작하는 조회문만 쓸 수 있습니다";
    static final String MSG_MULTI = "문장은 하나만 쓸 수 있습니다";
    static final String MSG_FORBIDDEN = "쓸 수 없는 낱말이 있습니다: ";
    static final String MSG_UNCLOSED = "닫히지 않은 따옴표·괄호·주석이 있습니다";
    static final String MSG_SPECIAL = "특수 문자열 표기(E'…', q'…', $$…$$, `…`, U&\"…\")는 쓸 수 없습니다";
    static final String MSG_BRACKET_ESCAPE = "대괄호 식별자 안에 ]] 를 쓸 수 없습니다(DB 마다 식별자가 끝나는 자리를 다르게 읽습니다)";
    static final String MSG_LONE_CR = "줄 주석 안에 줄바꿈 없는 캐리지 리턴을 쓸 수 없습니다(DB 마다 주석이 끝나는 자리를 다르게 읽습니다)";
    static final String MSG_NESTED_COMMENT = "주석 안에 /* 를 다시 쓸 수 없습니다(DB 마다 겹친 주석을 다르게 읽습니다)";
    static final String MSG_FORBIDDEN_FUNCTION = "쓸 수 없는 함수가 있습니다: ";

    /**
     * 식별자를 이루는 글자(Oracle 의 $·# 포함) — 낱말 경계 판단용. 거절 낱말·함수 패턴은 {@code UNICODE_CASE} 로 대소문자를 유니코드 규칙으로
     * 무시한다 — ASCII 규칙만 쓰면 대문자로 바꾸면 I·S 가 되는 {@code ı}(U+0131)·{@code ſ}(U+017F)를 끼운 {@code DBMS_PıPE}·{@code DBMſ_XMLGEN}
     * 이 통과하는데, 이름을 대문자로 바꿔 찾는 DB(Oracle 등)는 그것을 원래 이름으로 읽을 수 있다.
     */
    private static final String WORD_CHAR = "[\\p{L}\\p{N}_$#]";

    private static final Pattern FIRST_WORD =
            Pattern.compile("^(SELECT|WITH)(?!" + WORD_CHAR + ")", Pattern.CASE_INSENSITIVE);

    /**
     * 4단계 금지 낱말. 둘째 줄부터는 SQL Server 가 {@code ;} 없이 한 배치에 이어 쓸 수 있는 문장 중 읽기 전용 강제가 없는 그 DB 에서
     * 서버 자원을 붙잡거나 서버를 바꾸는 것(대기·세션 종료·종료·DBCC·설정 반영·백업·복원·권한 거부)과, 연결을 풀에 돌려준 뒤에도 남거나
     * 잠금을 붙잡는 T-SQL 흐름·세션 문장(DB 바꾸기·변수·반복·블록·이동·텍스트 쓰기·체크포인트·사용자 바꾸기·오류 로그)이다 —
     * 어느 DB 의 SELECT 문법에도 쓰이지 않는다(같은 이름의 열은 큰따옴표로 감싼다, {@link #forbiddenWord}).
     */
    private static final Pattern FORBIDDEN = Pattern.compile(
            "(?<!" + WORD_CHAR + ")(INSERT|UPDATE|DELETE|MERGE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|EXECUTE|EXEC|CALL"
                    + "|COMMIT|ROLLBACK|INTO|PRAGMA|ATTACH|DETACH"
                    + "|DENY|WAITFOR|KILL|SHUTDOWN|DBCC|RECONFIGURE|BACKUP|RESTORE"
                    + "|USE|DECLARE|WHILE|BEGIN|GOTO|WRITETEXT|UPDATETEXT|READTEXT|CHECKPOINT|SETUSER|RAISERROR|REVERT)(?!" + WORD_CHAR + ")",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    /**
     * 4단계 중 실행 DB 가 SQL Server 일 때만 더 막는 낱말 — {@code SET}(세션 설정: {@code SET IMPLICIT_TRANSACTIONS OFF} 는 mssql-jdbc 가
     * autoCommit=false 를 구현하는 방식을 꺼 뒤이은 쓰기를 자동 커밋하게 하고, {@code SET LANGUAGE}·{@code SET ANSI_WARNINGS OFF} 는 풀에
     * 돌려준 연결에 남는다)·{@code IF}. 다른 DB 에서는 함수 이름(Oracle {@code SET()}, SQLite·MySQL {@code if()})이라 막지 않는다.
     */
    private static final Pattern SQLSERVER_FORBIDDEN = Pattern.compile(
            "(?<!" + WORD_CHAR + ")(SET|IF)(?!" + WORD_CHAR + ")",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    /**
     * 6단계 함수 거절 목록 — 읽기 전용 트랜잭션이 막지 못하는 부수효과·외부 통신·서버 자원 붙잡기, 그리고 <b>문자열로 받은 SQL·XML 질의를
     * 스스로 실행하는 함수</b>(리터럴은 가린 사본에서 안 보이므로 그 안의 함수는 검사가 못 본다 — 바깥 함수 이름으로 막는다,
     * 2026-10-03 실 PostgreSQL 재현: {@code ts_stat('select … pg_terminate_backend(pid) …')} 가 읽기 전용 트랜잭션에서 다른 세션을 끊었다).
     * 이름이 맞아도 <b>부르는 모양일 때만</b> 거절한다({@link #isCalled}) — 이름 뒤에 공백·주석을 건너뛰고 {@code (}·{@code .}·{@code @} 가
     * 와야 한다. 낱말 경계라 스키마·패키지 접두({@code pg_catalog.ts_stat(}, {@code SYS.DBMS_LOCK.SLEEP}, {@code UTL_HTTP.REQUEST})도 걸리고,
     * 주석을 끼워도({@code ts_stat/**&#47;(}) 주석은 공백으로 가려져 이름과 괄호가 그대로 남는다. 열·표·별칭 이름({@code XP_CNT},
     * {@code FROM XP_HIST}, {@code AS "xmltype"})은 뒤에 괄호가 없어 통과한다(표 이름으로 열을 한정한 {@code XP_HIST.CNT} 는 패키지 호출과
     * 구별할 수 없어 거절된다 — 별칭을 쓴다).
     * <p>
     * 접두로 넓게 막는 것은 이름이 계속 늘어나는 함수 무리(권고 잠금·서버 파일·{@code *_to_xml*}·{@code crosstab<n>}·SQL Server 확장 프로시저
     * {@code xp_*})뿐이다. 낱말이 열 이름과 겹칠 수 있는 무리는 하나씩 적는다 — {@code lo_*} 는 {@code LO_CD} 같은 열을 막게 된다.
     * {@code DBMS_} 전체를 막지 않는 것은 {@code DBMS_LOB.SUBSTR} 같은 평범한 CLOB 조회를 살리기 위해서다. {@code current_setting} 은
     * 같은 값을 {@code pg_settings} 뷰로도 읽을 수 있어 막지 않는다.
     */
    private static final Pattern FORBIDDEN_FUNCTION = Pattern.compile(
            "(?<!" + WORD_CHAR + ")("
                    // PostgreSQL — 세션 종료·권고 잠금(잠금 표 고갈)·대기·설정 바꾸기·알림·WAL 메시지
                    + "PG_TERMINATE_BACKEND|PG_CANCEL_BACKEND|PG_ADVISORY_[A-Z0-9_]*|PG_TRY_ADVISORY_[A-Z0-9_]*|PG_SLEEP(?:_[A-Z0-9_]+)?"
                    + "|SET_CONFIG|PG_NOTIFY|PG_RELOAD_CONF|PG_ROTATE_LOGFILE|PG_LOGICAL_EMIT_MESSAGE"
                    // PostgreSQL — 서버 파일(adminpack 포함)·큰 객체 쓰기·서버 파일 입출력
                    + "|PG_READ_[A-Z0-9_]*|PG_LS_[A-Z0-9_]*|PG_STAT_FILE|PG_FILE_[A-Z0-9_]*"
                    + "|LO_IMPORT|LO_EXPORT|LO_CREATE|LO_CREAT|LO_UNLINK|LO_PUT|LO_FROM_BYTEA|LO_TRUNCATE(?:64)?|LOWRITE"
                    // PostgreSQL — 다른 연결·백그라운드 작업자에서 실행(읽기 전용·롤백을 벗어난다)
                    + "|DBLINK(?:_[A-Z0-9_]+)?|PG_BACKGROUND_[A-Z0-9_]*"
                    // PostgreSQL — 복제 슬롯 만들기·지우기·전진·변경 소비와 통계 초기화(읽기 전용·롤백을 벗어난다 — 실 PostgreSQL 18.6 재현:
                    // pg_drop_replication_slot 영구 삭제, 만든 슬롯 남음, pg_stat_reset). 같은 이름의 뷰 pg_replication_slots 는 부르지 않으므로 통과한다
                    + "|PG_[A-Z_]*REPLICATION_SLOT[A-Z_]*|PG_LOGICAL_SLOT_[A-Z_]*|PG_REPLICATION_SLOT_ADVANCE|PG_STAT_RESET[A-Z0-9_]*"
                    // PostgreSQL — 문자열 SQL 실행(내장 ts_stat·ts_rewrite·*_to_xml, tablefunc crosstab·connectby, xml2 xpath_table)
                    + "|TS_STAT|TS_REWRITE|QUERY_TO_XML[A-Z0-9_]*|CURSOR_TO_XML[A-Z0-9_]*|TABLE_TO_XML[A-Z0-9_]*"
                    + "|SCHEMA_TO_XML[A-Z0-9_]*|DATABASE_TO_XML[A-Z0-9_]*|XPATH_TABLE|CROSSTAB[0-9]*|CONNECTBY"
                    // Oracle — 네트워크·파일·URI 원격 읽기(XMLTYPE 외부 엔터티 포함)
                    + "|UTL_HTTP|UTL_TCP|UTL_SMTP|UTL_MAIL|UTL_FILE|UTL_INADDR|HTTPURITYPE|DBURITYPE|XDBURITYPE|URIFACTORY|XMLTYPE|BFILENAME"
                    // Oracle — 잠금·대기·파이프·작업·동적 SQL·리터럴 안 SQL 실행·LDAP·자바·큐·OLAP 명령·외부 HTTP(APEX·클라우드)
                    + "|DBMS_LOCK|DBMS_SESSION|DBMS_PIPE|DBMS_ALERT|DBMS_SCHEDULER|DBMS_JOB|DBMS_SQL|DBMS_SYS_SQL"
                    + "|DBMS_XMLGEN|DBMS_XMLQUERY|DBMS_XMLSTORE|DBMS_SQLHASH|DBMS_LDAP|DBMS_JAVA[A-Z0-9_]*|DBMS_AQ[A-Z0-9_]*"
                    + "|DBMS_AW|DBMS_CLOUD[A-Z0-9_]*|APEX_WEB_SERVICE"
                    // SQLite — 확장 적재·토크나이저 포인터
                    + "|LOAD_EXTENSION|FTS3_TOKENIZER"
                    // SQL Server — 외부 행 집합·확장 프로시저·서버 파일 읽기 함수
                    + "|OPENROWSET|OPENDATASOURCE|OPENQUERY|XP_[A-Z0-9_]*"
                    + "|FN_GET_AUDIT_FILE|FN_XE_FILE_TARGET_READ_FILE|FN_TRACE_GETTABLE|FN_DBLOG|FN_DUMP_DBLOG"
                    + ")(?!" + WORD_CHAR + ")",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    /**
     * 6단계 중 SQL Server 의 알려진 위험 저장 프로시저 — 괄호 없이 부르므로({@code sp_executesql N'…'}) 부르는 모양을 따지지 않고 <b>낱말만으로</b>
     * 거절한다. 저장 프로시저는 첫 문장이 아니면 {@code EXEC} 없이 부를 수 없고 {@code EXEC}·{@code EXECUTE} 는 4단계가 막으므로 보조다.
     * {@code sp_*} 를 접두로 막지 않는 것은 {@code SP_CD} 같은 열을 살리기 위해서다(이름을 하나씩 적어 열 이름과 겹칠 일이 드물다).
     */
    private static final Pattern FORBIDDEN_PROCEDURE = Pattern.compile(
            "(?<!" + WORD_CHAR + ")("
                    + "SP_EXECUTESQL|SP_OACREATE|SP_OAMETHOD|SP_CONFIGURE|SP_ADDEXTENDEDPROC|SP_ADDLINKEDSERVER"
                    + "|SP_ADDSRVROLEMEMBER|SP_SEND_DBMAIL|SP_START_JOB"
                    + ")(?!" + WORD_CHAR + ")",
            Pattern.CASE_INSENSITIVE | Pattern.UNICODE_CASE);

    /**
     * 이름 붙은 변수 {@code :name}·{@code &name}(Spring 이 둘 다 변수로 바꾼다). 앞 글자가 ':' 인 ':'(PostgreSQL ::text 캐스트)는
     * 변수가 아니다. 이름은 Spring {@code NamedParameterUtils}(spring-jdbc 7.0.7) 처럼 공백·구분 글자
     * {@code "':&,;()|=+-*%/\<>^]} 앞까지로 잡는다({@code :userId.x}·{@code :1}·{@code :{x}} 도 한 덩어리 이름) — 좁게 잡으면
     * 검사는 통과하고 실행 때 'No value supplied' 로 늘 실패하는 SQL 이 생긴다.
     */
    private static final Pattern VARIABLE = Pattern.compile("((?<!:):|&)([^\\s\"':&,;()|=+\\-*%/\\\\<>^\\]]+)");

    /** PostgreSQL 달러 따옴표 시작($$ 또는 $tag$). */
    private static final Pattern DOLLAR_QUOTE = Pattern.compile("\\$(?:[A-Za-z_][A-Za-z0-9_]*)?\\$");

    /**
     * 검사 결과.
     *
     * @param sql       실행할 SQL — 원문에서 끝 {@code ;} 를 지우고 앞뒤 공백을 정리한 것
     * @param variables SQL 이 쓰는 시스템 변수 이름(처음 나온 순서, 중복 없음)
     */
    public record Validated(String sql, List<String> variables) {}

    private SqlGuard() {}

    /**
     * §7.1 검사 + 실행 DB 갈래에만 해당하는 규칙(지금은 SQL Server 의 {@code SET}·{@code IF}). 갈래를 모르면(null)
     * {@link #check(String)} 와 같다. SQL Server 는 대괄호를 식별자로 읽으므로 대괄호 식별자를 가린 사본으로 본다({@code [SET]} 열은 통과).
     */
    public static Validated check(String sql, WidgetReadOnlyJdbc.Dialect dialect) {
        Validated validated = check(sql);
        if (dialect == WidgetReadOnlyJdbc.Dialect.SQLSERVER) {
            Matcher m = SQLSERVER_FORBIDDEN.matcher(mask(sql, true));
            if (m.find()) throw invalid(forbiddenWord(m.group(1).toUpperCase(Locale.ROOT)));
        }
        return validated;
    }

    /** §7.1 검사(어느 DB 에나 적용하는 규칙). 어기면 {@code BusinessException(INVALID_VALUE, 사람이 읽을 메시지)}. */
    public static Validated check(String sql) {
        if (sql == null || sql.isBlank()) throw invalid(MSG_EMPTY);

        // 대괄호를 식(배열 첨자)으로 읽는 쪽(PostgreSQL·Oracle·H2·Spring 변수 해석)과 식별자로 읽는 쪽(SQLite·MSSQL)을 모두 본다.
        Inspection asExpression = inspect(mask(sql, false));
        Inspection asIdentifier = inspect(mask(sql, true));
        // 두 해석이 지울 끝 ; 자리가 다르면 어느 쪽 문장인지 정할 수 없다 — 여러 문장으로 보고 거절한다.
        if (asExpression.semicolon() != asIdentifier.semicolon()) throw invalid(MSG_MULTI);

        // 6. 함수 거절 목록 — 따옴표·대괄호 식별자 안 글자도 드러낸 사본(대괄호 두 해석 모두)으로 본다.
        rejectForbiddenFunction(mask(sql, false, true));
        rejectForbiddenFunction(mask(sql, true, true));

        // 가린 사본과 원문은 글자 위치가 같다 — 원문에서 그 자리의 ; 만 지운다.
        int semicolon = asExpression.semicolon();
        String executable = semicolon >= 0 ? sql.substring(0, semicolon) + sql.substring(semicolon + 1) : sql;
        // 바인딩할 변수는 Spring 과 같은 해석에서 얻는다(대괄호 안 :name 도 Spring 은 변수로 바꾼다).
        return new Validated(executable.strip(), asExpression.variables());
    }

    /** 가린 사본 하나에 대한 2~5단계 결과. semicolon 은 끝 ; 자리(없으면 -1). */
    private record Inspection(int semicolon, List<String> variables) {}

    /** §7.1 2~5단계 — 가린 사본 하나로 판단한다. */
    private static Inspection inspect(String masked) {
        // 2. 첫 낱말
        if (!FIRST_WORD.matcher(masked.strip()).find()) throw invalid(MSG_NOT_SELECT);

        // 3. 끝 ; 하나만
        int semicolon = masked.indexOf(';');
        if (semicolon >= 0) {
            boolean onlyTrailing = masked.indexOf(';', semicolon + 1) < 0 && masked.substring(semicolon + 1).isBlank();
            if (!onlyTrailing) throw invalid(MSG_MULTI);
        }

        // 4. 금지 낱말
        Matcher forbidden = FORBIDDEN.matcher(masked);
        if (forbidden.find()) throw invalid(forbiddenWord(forbidden.group(1).toUpperCase(Locale.ROOT)));

        // 5. 시스템 변수만(:name·&name)
        Set<String> used = new LinkedHashSet<>();
        Matcher variable = VARIABLE.matcher(masked);
        while (variable.find()) {
            String name = variable.group(2);
            if (!SYSTEM_VARIABLES.contains(name)) {
                throw invalid("알 수 없는 변수입니다: " + variable.group(1) + name
                        + " (쓸 수 있는 변수: :" + String.join(", :", SYSTEM_VARIABLES) + ")");
            }
            used.add(name);
        }
        return new Inspection(semicolon, List.copyOf(new ArrayList<>(used)));
    }

    /**
     * 4단계 거절 문구. 금지 낱말은 같은 이름의 열·표({@code SELECT SHUTDOWN FROM TB_EQP})도 막으므로 큰따옴표로 감싸는 길을 알려 준다 —
     * 따옴표 식별자는 가린 사본에서 공백이 되어 4단계를 지난다. 따옴표 안은 대소문자를 가리므로(PostgreSQL 은 소문자로 만든 이름) 그것도 적는다.
     */
    static String forbiddenWord(String word) {
        return MSG_FORBIDDEN + word + " — 열·표 이름이면 큰따옴표로 감싸세요(예: \"" + word + "\", 따옴표 안은 대소문자를 구분합니다)";
    }

    /** 6단계 — 식별자 글자를 드러낸 사본에서 거절 목록 함수를 부르는 곳(과 위험 저장 프로시저 이름)을 찾는다. */
    private static void rejectForbiddenFunction(String revealed) {
        Matcher procedure = FORBIDDEN_PROCEDURE.matcher(revealed);
        if (procedure.find()) throw invalid(MSG_FORBIDDEN_FUNCTION + procedure.group(1).toUpperCase(Locale.ROOT));
        Matcher m = FORBIDDEN_FUNCTION.matcher(revealed);
        while (m.find()) {
            if (isCalled(revealed, m.end())) throw invalid(MSG_FORBIDDEN_FUNCTION + m.group(1).toUpperCase(Locale.ROOT));
        }
    }

    /**
     * 이름 끝(from) 뒤가 부르는 모양인가 — 공백·주석(가린 사본에서 공백)을 건너뛴 첫 글자가 {@code (}(호출)·{@code .}(Oracle 패키지
     * {@code DBMS_X.F}, 형 메서드 {@code XMLTYPE.CREATEXML})·{@code @}(Oracle DB 링크 {@code F@LINK(})이면 true.
     * 건너뛰는 글자는 유니코드 공백·구분자·제어·서식 글자까지 넓게 잡는다 — DB 가 공백으로 읽는 글자를 놓치면 우회가 되고,
     * 넓게 잡아서 생기는 일은 더 많이 거절하는 것뿐이다.
     */
    private static boolean isCalled(String revealed, int from) {
        int k = from;
        int n = revealed.length();
        while (k < n) {
            int cp = revealed.codePointAt(k);
            if (!isSkippable(cp)) return cp == '(' || cp == '.' || cp == '@';
            k += Character.charCount(cp);
        }
        return false;
    }

    private static boolean isSkippable(int cp) {
        if (Character.isWhitespace(cp) || Character.isSpaceChar(cp)) return true;
        int type = Character.getType(cp);
        return type == Character.CONTROL || type == Character.FORMAT;
    }

    /** {@link #mask(String, boolean, boolean)} 의 식별자를 가리는 판(2~5단계용). */
    static String mask(String sql, boolean bracketIdentifiers) {
        return mask(sql, bracketIdentifiers, false);
    }

    /**
     * 리터럴·따옴표 식별자·주석(bracketIdentifiers 이면 대괄호 식별자도)을 같은 길이의 공백으로 바꾼 사본(줄바꿈은 그대로 둔다).
     * 왼쪽부터 한 글자씩 읽는다 — 먼저 열린 구간이 이긴다(DB 렉서와 같은 순서).
     *
     * @param bracketIdentifiers true 면 {@code […]} 를 식별자로 가린다(SQLite·MSSQL), false 면 코드로 둔다(PostgreSQL 배열 첨자 등)
     * @param revealIdentifiers  true 면 따옴표·대괄호 식별자는 여닫는 글자만 공백으로 바꾸고 안 글자는 그대로 둔다(6단계 함수 이름 검사용)
     */
    static String mask(String sql, boolean bracketIdentifiers, boolean revealIdentifiers) {
        int n = sql.length();
        StringBuilder out = new StringBuilder(n);
        int i = 0;
        while (i < n) {
            char c = sql.charAt(i);
            char next = i + 1 < n ? sql.charAt(i + 1) : '\0';
            int end;
            if (c == '-' && next == '-') {
                end = i + 2;
                while (end < n && sql.charAt(end) != '\n') {
                    // \r\n 은 어느 DB 나 \n 에서 끝나지만, 따로 떨어진 \r 은 주석을 끝내는 DB 와 아닌 DB 가 갈린다.
                    if (sql.charAt(end) == '\r' && !(end + 1 < n && sql.charAt(end + 1) == '\n')) throw invalid(MSG_LONE_CR);
                    end++;
                }
            } else if (c == '/' && next == '*') {
                int close = sql.indexOf("*/", i + 2);
                if (close < 0) throw invalid(MSG_UNCLOSED);
                // 닫는 */ 보다 앞에 /* 가 또 열리면(닫는 */ 의 * 를 함께 쓰는 /*/ 포함) 겹친 주석이다 —
                // PostgreSQL·MSSQL 은 한 단계 더 열린 것으로, Oracle·SQLite 는 첫 */ 에서 닫힌 것으로 읽어 주석 범위가 갈린다.
                int nested = sql.indexOf("/*", i + 2);
                if (nested >= 0 && nested < close) throw invalid(MSG_NESTED_COMMENT);
                end = close + 2;
            } else if (c == '\'') {
                if (isSpecialStringPrefix(sql, i)) throw invalid(MSG_SPECIAL);
                end = closeQuoted(sql, i, '\'');
            } else if (c == '"') {
                if (isUnicodeIdentifierPrefix(sql, i)) throw invalid(MSG_SPECIAL);
                end = closeQuoted(sql, i, '"');
                if (revealIdentifiers) {
                    appendRevealed(out, sql, i, end);
                    i = end;
                    continue;
                }
            } else if (c == '[' && bracketIdentifiers) {
                end = closeBracket(sql, i);
                if (revealIdentifiers) {
                    appendRevealed(out, sql, i, end);
                    i = end;
                    continue;
                }
            } else {
                if (c == '$' && (i == 0 || !isWordChar(sql.charAt(i - 1)))
                        && DOLLAR_QUOTE.matcher(sql).region(i, n).lookingAt()) {
                    throw invalid(MSG_SPECIAL);
                }
                // 백틱은 SQLite(MySQL 호환)·Spring 변수 해석이 따옴표로 읽고, 다른 DB 는 아니다 — 리터럴·주석 밖에서는 받지 않는다.
                if (c == '`') throw invalid(MSG_SPECIAL);
                out.append(c);
                i++;
                continue;
            }
            for (int k = i; k < end; k++) {
                char m = sql.charAt(k);
                out.append(m == '\n' || m == '\r' ? m : ' ');
            }
            i = end;
        }
        return out.toString();
    }

    /** 식별자 [start, end) — 여는 글자·닫는 글자는 공백, 안 글자는 그대로(길이는 원문과 같다). */
    private static void appendRevealed(StringBuilder out, String sql, int start, int end) {
        out.append(' ');
        for (int k = start + 1; k < end - 1; k++) out.append(sql.charAt(k));
        out.append(' ');
    }

    /** {@code "} 바로 앞이 PostgreSQL 유니코드 식별자 접두 {@code U&}(U 는 독립 낱말)인가 — 이스케이프로 함수 이름을 숨길 수 있다. */
    private static boolean isUnicodeIdentifierPrefix(String sql, int quote) {
        if (quote < 2 || sql.charAt(quote - 1) != '&') return false;
        char u = sql.charAt(quote - 2);
        if (u != 'U' && u != 'u') return false;
        return quote < 3 || !isWordChar(sql.charAt(quote - 3));
    }

    /** start 의 여는 글자부터 닫는 글자 다음 위치. 닫는 글자 두 번({@code ''}·{@code ""}·{@code ]]})은 글자 하나로 본다. */
    private static int closeQuoted(String sql, int start, char close) {
        int n = sql.length();
        int j = start + 1;
        while (j < n) {
            if (sql.charAt(j) == close) {
                if (j + 1 < n && sql.charAt(j + 1) == close) {
                    j += 2;
                    continue;
                }
                return j + 1;
            }
            j++;
        }
        throw invalid(MSG_UNCLOSED);
    }

    /** start 의 {@code [} 부터 첫 {@code ]} 다음 위치. {@code ]]} 는 DB 마다 읽는 방식이 달라 받지 않는다. */
    private static int closeBracket(String sql, int start) {
        int close = sql.indexOf(']', start + 1);
        if (close < 0) throw invalid(MSG_UNCLOSED);
        if (close + 1 < sql.length() && sql.charAt(close + 1) == ']') throw invalid(MSG_BRACKET_ESCAPE);
        return close + 1;
    }

    /** {@code '} 바로 앞이 독립 낱말 E·Q·NQ 인가(PostgreSQL E'\'' 이스케이프 문자열, Oracle q'[…]' 대체 따옴표). */
    private static boolean isSpecialStringPrefix(String sql, int quote) {
        int k = quote;
        while (k > 0 && isWordChar(sql.charAt(k - 1))) k--;
        String prefix = sql.substring(k, quote);
        return prefix.equalsIgnoreCase("E") || prefix.equalsIgnoreCase("Q") || prefix.equalsIgnoreCase("NQ");
    }

    private static boolean isWordChar(char c) {
        return Character.isLetterOrDigit(c) || c == '_' || c == '$' || c == '#';
    }

    private static BusinessException invalid(String message) {
        return new BusinessException(ErrorCode.INVALID_VALUE, message);
    }
}
