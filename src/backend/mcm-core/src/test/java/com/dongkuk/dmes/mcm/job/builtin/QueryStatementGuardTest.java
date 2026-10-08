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
            "UPDATE T SET A = 1 WHERE B = :1",
            "UPDATE T SET A = &x",
            "UPDATE T SET A = 'abc",
            "",
            "   ",
    })
    @DisplayName("거절 — SELECT·DDL·트랜잭션 제어·여러 문장·EXECUTE IMMEDIATE·DB 링크·대체 따옴표·위치 바인드·닫히지 않은 따옴표·빈 문장")
    void rejected(String sql) {
        assertThatThrownBy(() -> QueryStatementGuard.check(sql)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("거절 메시지에 문장 원문을 넣지 않는다")
    void messageHasNoSql() {
        assertThatThrownBy(() -> QueryStatementGuard.check("DROP TABLE SECRET_TABLE_NAME"))
                .isInstanceOf(IllegalArgumentException.class).satisfies(e -> assertThat(e.getMessage()).doesNotContain("SECRET_TABLE_NAME"));
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
