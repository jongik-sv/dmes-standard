package com.dongkuk.dmes.analog.web;

import com.dongkuk.dmes.analog.db.DbViewerException;
import com.dongkuk.dmes.analog.db.DbViewerValidator;
import org.junit.jupiter.api.Test;

import java.util.List;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

class DbViewerValidatorTest {

    private static final Set<String> ALLOWED = Set.of("MCMAPUSER", "MCM_SOURCE");

    @Test
    void 단순_조회를_파싱한다() {
        DbViewerValidator.ParsedQuery parsed = DbViewerValidator.parseSelect(
                "SELECT CODE_ID, CODE_NM FROM MCMAPUSER.TB_MCM_CODE_MASTER", ALLOWED);
        assertThat(parsed.schema()).isEqualTo("MCMAPUSER");
        assertThat(parsed.table()).isEqualTo("TB_MCM_CODE_MASTER");
        assertThat(parsed.star()).isFalse();
        assertThat(parsed.columns()).containsExactly("CODE_ID", "CODE_NM");
        assertThat(parsed.where()).isNull();
    }

    @Test
    void 소문자와_인용부호를_정규화한다() {
        DbViewerValidator.ParsedQuery parsed = DbViewerValidator.parseSelect(
                "select \"code_id\" from \"mcmapuser\".\"tb_mcm_code_master\" where code_id = 'A'", ALLOWED);
        assertThat(parsed.schema()).isEqualTo("MCMAPUSER");
        assertThat(parsed.columns()).containsExactly("CODE_ID");
        assertThat(parsed.where()).isEqualTo("code_id = 'A'");
    }

    @Test
    void star는_확장_대상으로_파싱한다() {
        DbViewerValidator.ParsedQuery parsed = DbViewerValidator.parseSelect(
                "SELECT * FROM MCM_SOURCE.TB_MCM_CODE_MASTER", ALLOWED);
        assertThat(parsed.star()).isTrue();
    }

    @Test
    void 실행SQL은_재조립하고_건수상한을_강제한다() {
        DbViewerValidator.ParsedQuery parsed = DbViewerValidator.parseSelect(
                "SELECT CODE_ID FROM MCMAPUSER.TB_MCM_CODE_MASTER", ALLOWED);
        String sql = DbViewerValidator.buildSql(parsed, List.of("CODE_ID"), 200);
        assertThat(sql).isEqualTo(
                "SELECT \"CODE_ID\" FROM \"MCMAPUSER\".\"TB_MCM_CODE_MASTER\" FETCH FIRST 200 ROWS ONLY");
    }

    @Test
    void 허용되지_않은_스키마를_거부한다() {
        assertThatThrownBy(() -> DbViewerValidator.parseSelect("SELECT * FROM SCOTT.EMP", ALLOWED))
                .isInstanceOf(DbViewerException.class);
    }

    @Test
    void 스키마_생략을_거부한다() {
        assertThatThrownBy(() -> DbViewerValidator.parseSelect("SELECT * FROM EMP", ALLOWED))
                .isInstanceOf(DbViewerException.class);
    }

    @Test
    void DML과_DDL을_거부한다() {
        assertThatThrownBy(() -> DbViewerValidator.parseSelect("DELETE FROM MCMAPUSER.T", ALLOWED))
                .isInstanceOf(DbViewerException.class);
        assertThatThrownBy(() -> DbViewerValidator.parseSelect("SELECT * FROM MCMAPUSER.T; DELETE FROM X", ALLOWED))
                .isInstanceOf(DbViewerException.class);
    }

    @Test
    void 집합연산과_서브쿼리_통로를_거부한다() {
        assertThatThrownBy(() -> DbViewerValidator.parseSelect(
                "SELECT A FROM MCMAPUSER.T UNION SELECT B FROM MCMAPUSER.U", ALLOWED))
                .isInstanceOf(DbViewerException.class);
        assertThatThrownBy(() -> DbViewerValidator.parseSelect(
                "SELECT * FROM MCMAPUSER.T WHERE A IN (SELECT A FROM MCMAPUSER.U)", ALLOWED))
                .isInstanceOf(DbViewerException.class);
    }

    @Test
    void 페이징_우회를_거부한다() {
        assertThatThrownBy(() -> DbViewerValidator.parseSelect(
                "SELECT * FROM MCMAPUSER.T WHERE ROWNUM < 5", ALLOWED))
                .isInstanceOf(DbViewerException.class);
    }

    @Test
    void 주석으로_건수상한_우회를_거부한다() {
        assertThatThrownBy(() -> DbViewerValidator.parseSelect(
                "SELECT A FROM MCMAPUSER.T WHERE 1=1 --", ALLOWED))
                .isInstanceOf(DbViewerException.class);
        assertThatThrownBy(() -> DbViewerValidator.parseSelect(
                "SELECT A FROM MCMAPUSER.T WHERE 1=1 /* x */", ALLOWED))
                .isInstanceOf(DbViewerException.class);
    }

    @Test
    void 민감_컬럼을_거부한다() {
        assertThatThrownBy(() -> DbViewerValidator.parseSelect(
                "SELECT USER_PASS FROM MCMAPUSER.T", ALLOWED))
                .isInstanceOf(DbViewerException.class);
        assertThat(DbViewerValidator.isSensitiveColumn("PRIVATE_KEY")).isTrue();
        assertThat(DbViewerValidator.isSensitiveColumn("CODE_ID")).isFalse();
    }

    @Test
    void FROM_WHERE_포함_컬럼명을_오탐하지_않는다() {
        DbViewerValidator.ParsedQuery parsed = DbViewerValidator.parseSelect(
                "SELECT FROM_DT, WHEREABOUTS FROM MCMAPUSER.T", ALLOWED);
        assertThat(parsed.columns()).containsExactly("FROM_DT", "WHEREABOUTS");
        assertThat(parsed.where()).isNull();
    }
}
