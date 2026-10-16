package com.dongkuk.dmes.mcm.job.builtin;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

class QueryStatementGuardTest {

    @ParameterizedTest
    @ValueSource(strings = {
            "UPDATE T SET A = 1 WHERE B = :b",
            "update t set a = 1 where b = :b;",
            "INSERT INTO T (A) VALUES (:a)",
            "DELETE FROM T WHERE D < :cutoff",
            "MERGE INTO T X USING (SELECT 1 A FROM DUAL) S ON (X.A = S.A) WHEN MATCHED THEN UPDATE SET X.B = 1",
            "UPDATE T SET A = 'DROP TABLE X; COMMIT' /* ROLLBACK */ -- DROP\n WHERE B = 1",
            "BEGIN PKG.P(:schedAt); END;",
            "begin pkg.p(:a, 'x;y', 3); end",
            "BEGIN SCHEMA1.PKG.P; END;",
            "UPDATE T SET A = N'abc' WHERE B = 1",
            "UPDATE T SET A = 1 -- 주석\r\n WHERE B = 1",
            "UPDATE T SET A_NQ = 'x' WHERE SEQ = 'y'",
    })
    @DisplayName("허용 — DML 한 문장(끝 ; 는 떼어 낸다)이나 프로시저 호출 하나. 주석·문자열 안의 금지어는 본다")
    void allowed(String sql) {
        QueryStatementGuard.Checked c = QueryStatementGuard.check(sql);
        assertThat(c.sql()).isNotBlank();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "SELECT 1 FROM DUAL",
            "UPDATE A SET X = 1; DELETE FROM B",
            "DROP TABLE X",
            "TRUNCATE TABLE X",
            "COMMIT",
            "ROLLBACK",
            "UPDATE T SET A = 1; COMMIT",
            "BEGIN EXECUTE IMMEDIATE 'x'; END;",
            "BEGIN P1; P2; END;",
            "BEGIN P1(:a); COMMIT; END;",
            "UPDATE T SET A = 1 WHERE B IN (SELECT B FROM T2@DBLINK)",
            "UPDATE T SET A = q'[x]' WHERE 1 = 1",
            "UPDATE T SET A = nq'[x]' WHERE 1 = 1",
            "UPDATE T SET A = NQ'{x}' WHERE 1 = 1",
            "UPDATE T SET A = Nq '<x>' WHERE 1 = 1",
            "UPDATE T SET A = nQ'(x)' WHERE 1 = 1",
            "UPDATE T SET A = 1nq'[ ' ]' WHERE 1 = 1 OR EXISTS (SELECT 1 FROM T2@REMOTE) -- '",
            "UPDATE T SET A = 1e5q'[ ' ]' WHERE 1 = 1 OR EXISTS (SELECT 1 FROM T2@REMOTE) -- '",
            "UPDATE T SET A = 1E5NQ'[ ' ]' WHERE 1 = 1 OR EXISTS (SELECT 1 FROM T2@REMOTE) -- '",
            "UPDATE T SET A = 1.e5q'[ ' ]' WHERE 1 = 1 OR EXISTS (SELECT 1 FROM T2@REMOTE) -- '",
            "UPDATE T SET A = 1fq'[ ' ]' WHERE 1 = 1 OR EXISTS (SELECT 1 FROM T2@REMOTE) -- '",
            "UPDATE T SET A = 1dq'[ ' ]' WHERE 1 = 1 OR EXISTS (SELECT 1 FROM T2@REMOTE) -- '",
            "UPDATE T SET A = CONCAT('a',q'[x]') WHERE 1 = 1",
            "UPDATE T SET A = (nq'[x]') WHERE 1 = 1",
            "UPDATE T SET A = /**/q'[x]' WHERE 1 = 1",
            "UPDATE T SET A = 'a'||q'[x]' WHERE 1 = 1",
            "UPDATE T SET A = 1 -- 주석\rWHERE B = 1",
            "UPDATE T SET A = 1 WHERE B = :1",
            "UPDATE T SET A = &x",
            "UPDATE T SET A = 'abc",
            "",
            "   ",
    })
    @DisplayName("거절 — SELECT·DDL·트랜잭션 제어·여러 문장·EXECUTE IMMEDIATE·DB 링크·대체 따옴표(q·nq)·위치 바인드·주석 안 단독 CR·닫히지 않은 따옴표·빈 문장")
    void rejected(String sql) {
        assertThatThrownBy(() -> QueryStatementGuard.check(sql)).isInstanceOf(IllegalArgumentException.class);
    }

    /**
     * Oracle 은 국가 문자 대체 따옴표 {@code nq'[…]'} 안의 {@code '} 를 글자로 읽는다(2026-10-16 L_MAIN 실측: {@code LENGTH(nq'[a'b]')} = 3).
     * 이 검사기는 {@code '} 를 차례로 짝지어 가리므로, 아래 문장의 DB 링크 구간이 가린 사본에서는 문자열 속으로 숨는다.
     */
    @Test
    @DisplayName("nq'…' 는 거절한다 — 가린 사본이 원문과 어긋나 그 뒤의 DB 링크를 못 보던 문장(F6)")
    void nqAltQuoteRejected() {
        String sql = "UPDATE T SET A = nq'[ ' ]' WHERE 1 = 1 OR EXISTS (SELECT 1 FROM T2@REMOTE) -- '";
        assertThatThrownBy(() -> QueryStatementGuard.check(sql))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("대체 따옴표 q'…'·nq'…' 는 쓸 수 없습니다");
    }

    @Test
    @DisplayName("-- 주석 안의 단독 CR 은 거절한다 — CRLF 는 받는다")
    void loneCrInLineCommentRejected() {
        assertThatThrownBy(() -> QueryStatementGuard.check("UPDATE T SET A = 1 -- 주석\rWHERE B = 1"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("주석 안의 단독 줄바꿈(CR)은 쓸 수 없습니다");
        assertThatThrownBy(() -> QueryStatementGuard.check("UPDATE T SET A = 1 -- 끝\r"))
                .isInstanceOf(IllegalArgumentException.class)
                .hasMessage("주석 안의 단독 줄바꿈(CR)은 쓸 수 없습니다");
        assertThat(QueryStatementGuard.check("UPDATE T SET A = 'x\ry' /* a\rb */ WHERE B = 1").sql()).isNotBlank();
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "UPDATE T SET A = 'Q' WHERE B = 1",
            "UPDATE T SET A = 'NQ' WHERE B = 1",
            "UPDATE T SET A = 'x' WHERE B IN ('P', 'Q')",
            "UPDATE T SET A = 'q''' WHERE B = 'nq '' x'",
            "UPDATE T SET Q = 'x', NQ = 'y' WHERE B = 1",
    })
    @DisplayName("일반 문자열 'Q'·'NQ' 와 Q·NQ 칸 이름은 받는다 — q·nq 판별은 따옴표 밖 코드 자리에서만 한다")
    void plainQLiteralAllowed(String sql) {
        assertThat(QueryStatementGuard.check(sql).sql()).isEqualTo(sql);
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "UPDATE T SET A = \"UTL_HTTP\".REQUEST('http://x') WHERE ROWNUM = 1",
            "UPDATE T SET A = SYS.\"UTL_HTTP\".REQUEST('http://x') WHERE ROWNUM = 1",
            "UPDATE T SET A = 1 WHERE B IN (SELECT B FROM DUAL,\"T2\"@REMOTE)",
            "UPDATE T SET A = 1 WHERE B IN (SELECT B FROM T2@\"REMOTE\")",
            "BEGIN PKG.P(\"UTL_HTTP\".REQUEST('x')); END;",
    })
    @DisplayName("따옴표 식별자 안의 금지어와 따옴표에 붙은 DB 링크를 거절한다(F6)")
    void quotedIdentifierBypassRejected(String sql) {
        assertThatThrownBy(() -> QueryStatementGuard.check(sql)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("따옴표 식별자 우회의 거절 사유 — 금지어는 그 낱말, @ 는 DB 링크")
    void quotedIdentifierBypassMessages() {
        assertThatThrownBy(() -> QueryStatementGuard.check("UPDATE T SET A = \"UTL_HTTP\".REQUEST('http://x') WHERE ROWNUM = 1"))
                .hasMessage("쓸 수 없는 낱말이 있습니다: UTL_HTTP");
        assertThatThrownBy(() -> QueryStatementGuard.check("UPDATE T SET A = 1 WHERE B IN (SELECT B FROM DUAL,\"T2\"@REMOTE)"))
                .hasMessage("DB 링크는 쓸 수 없습니다");
        assertThatThrownBy(() -> QueryStatementGuard.check("UPDATE T SET A = 1 WHERE B IN (SELECT B FROM T2 @ REMOTE)"))
                .hasMessage("DB 링크는 쓸 수 없습니다");
    }

    @ParameterizedTest
    @ValueSource(strings = {
            "UPDATE \"MY_TABLE\" SET \"Col A\" = 1 WHERE \"KEY\" = :k",
            "UPDATE T SET A = 'a@b.com' WHERE B = 1 -- mail@host",
            "UPDATE T SET \"X@Y\" = 1 WHERE B = 1",
            "UPDATE T SET \"CREATED_AT\" = SYSDATE, CREATED_BY = :u WHERE B = 1",
    })
    @DisplayName("금지어가 아닌 따옴표 식별자, 문자열·주석·식별자 안의 @ 는 받는다")
    void quotedIdentifierAndAtInsideAllowed(String sql) {
        assertThat(QueryStatementGuard.check(sql).sql()).isEqualTo(sql);
    }

    @Test
    @DisplayName("거절 메시지에 문장 원문을 넣지 않는다")
    void messageHasNoSql() {
        assertThatThrownBy(() -> QueryStatementGuard.check("DROP TABLE SECRET_TABLE_NAME"))
                .isInstanceOf(IllegalArgumentException.class).satisfies(e -> assertThat(e.getMessage()).doesNotContain("SECRET_TABLE_NAME"));
    }

    @Test
    @DisplayName("허용 — V10 전기일 실행 이력 집계 샘플 SQL(MERGE)은 검사를 통과하고 바인드 변수 bizDay·baseHour·jobId 를 드러낸다")
    void seedSampleMergePasses() {
        String sql = """
                MERGE INTO TB_MCM_JOB_COLLECT_DATA T
                USING (SELECT TO_CHAR(:bizDay + :baseHour / 24, 'YYYYMMDDHH24MI') AS SLOT
                            , R.STATUS AS ITEM_KEY
                            , COUNT(*) AS CNT
                       FROM   TB_MCM_JOB_RUN R
                       WHERE  R.SCHED_AT >= :bizDay + :baseHour / 24
                       AND    R.SCHED_AT < :bizDay + 1 + :baseHour / 24
                       GROUP BY R.STATUS) S
                ON (T.JOB_ID = :jobId AND T.SLOT = S.SLOT AND T.ITEM_KEY = S.ITEM_KEY)
                WHEN MATCHED THEN UPDATE SET T.VALUE_NUM = S.CNT
                     , T.U_AT = CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP)
                     , T.U_USR_ID = 'SCHEDULER'
                     , T.U_PGM_ID = 'jobQuery'
                     , T.VER = T.VER + 1
                WHEN NOT MATCHED THEN INSERT (JOB_ID, SLOT, ITEM_KEY, VALUE_NUM, C_AT, C_USR_ID, C_PGM_ID, U_AT, U_USR_ID, U_PGM_ID, VER)
                     VALUES (:jobId, S.SLOT, S.ITEM_KEY, S.CNT
                          , CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP), 'SCHEDULER', 'jobQuery'
                          , CAST(SYSTIMESTAMP AT TIME ZONE 'Asia/Seoul' AS TIMESTAMP), 'SCHEDULER', 'jobQuery'
                          , 0)""";
        QueryStatementGuard.Checked c = QueryStatementGuard.check(sql);
        assertThat(c.procedure()).isFalse();
        assertThat(c.variables()).containsExactly("bizDay", "baseHour", "jobId");
    }

    @Test
    @DisplayName("바인드 변수 이름을 처음 나온 순서로 모은다(주석·문자열 속 :이름 제외) — 프로시저 여부 표시")
    void variablesAndProcedureFlag() {
        QueryStatementGuard.Checked dml = QueryStatementGuard.check("UPDATE T SET A = :a, B = ':notvar' WHERE C = :c AND D = :a -- :ignored");
        assertThat(dml.variables()).containsExactly("a", "c");
        assertThat(dml.procedure()).isFalse();
        assertThat(dml.sql()).doesNotEndWith(";");
        QueryStatementGuard.Checked proc = QueryStatementGuard.check("BEGIN PKG.P(:x); END;");
        assertThat(proc.procedure()).isTrue();
        assertThat(proc.sql()).isEqualTo("BEGIN PKG.P(:x); END;");
    }
}
