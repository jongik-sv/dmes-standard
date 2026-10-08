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
    void ROWID_옵션은_SELECT_목록_맨_앞에만_더하고_나머지는_같다() {
        DbViewerValidator.ParsedQuery parsed = DbViewerValidator.parseSelect(
                "SELECT CODE_ID, CODE_NM FROM MCMAPUSER.TB_MCM_CODE_MASTER WHERE CODE_ID = 'A'", ALLOWED);
        String plain = DbViewerValidator.buildSql(parsed, List.of("CODE_ID", "CODE_NM"), 200);
        String withRowId = DbViewerValidator.buildSql(parsed, List.of("CODE_ID", "CODE_NM"), 200, true);
        assertThat(DbViewerValidator.buildSql(parsed, List.of("CODE_ID", "CODE_NM"), 200, false)).isEqualTo(plain);
        assertThat(plain).doesNotContain("ROWID");
        assertThat(withRowId).isEqualTo(
                "SELECT ROWIDTOCHAR(ROWID) \"_ROWID\", \"CODE_ID\", \"CODE_NM\" "
                        + "FROM \"MCMAPUSER\".\"TB_MCM_CODE_MASTER\" WHERE CODE_ID = 'A' FETCH FIRST 200 ROWS ONLY");
    }

    @Test
    void ROWID_옵션이어도_건수상한과_빈_컬럼_검증은_유지한다() {
        DbViewerValidator.ParsedQuery parsed = DbViewerValidator.parseSelect(
                "SELECT CODE_ID FROM MCMAPUSER.TB_MCM_CODE_MASTER", ALLOWED);
        assertThat(DbViewerValidator.buildSql(parsed, List.of("CODE_ID"), 50, true))
                .endsWith("FETCH FIRST 50 ROWS ONLY");
        assertThatThrownBy(() -> DbViewerValidator.buildSql(parsed, List.of(), 50, true))
                .isInstanceOf(DbViewerException.class);
    }

    @Test
    void 사용자가_ROWID_별칭_칸을_직접_고를_수_없다() {
        assertThatThrownBy(() -> DbViewerValidator.parseSelect(
                "SELECT _ROWID FROM MCMAPUSER.TB_MCM_CODE_MASTER", ALLOWED))
                .isInstanceOf(DbViewerException.class);
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

    // ------------------------------------------------------------ WHERE·ORDER BY 민감 칸, JOIN·서브쿼리

    @Test
    void WHERE에_쓴_민감_칸을_거부한다() {
        for (String where : new String[]{
                "USER_PASS LIKE '$2a$1%'", "user_pass like 'a%'", "\"USER_PASS\" = 'x'",
                "CODE_ID = 'A' AND API_TOKEN IS NOT NULL", "SECRET_KEY>'a'", "A.PWD_HASH = 'x'"}) {
            assertThatThrownBy(() -> DbViewerValidator.parseSelect(
                    "SELECT CODE_ID FROM MCMAPUSER.T WHERE " + where, ALLOWED))
                    .as(where)
                    .isInstanceOf(DbViewerException.class)
                    .satisfies(e -> assertThat(((DbViewerException) e).getStatusCode().value()).isEqualTo(400));
        }
    }

    @Test
    void WHERE의_따옴표_안_문자열_값은_식별자가_아니므로_오탐하지_않는다() {
        DbViewerValidator.ParsedQuery parsed = DbViewerValidator.parseSelect(
                "SELECT CODE_ID FROM MCMAPUSER.T WHERE CODE_NM = 'PASSWORD TOKEN secret' "
                        + "AND CODE_ID <> 'it''s PRIVATE' AND USE_YN = 'Y'", ALLOWED);
        assertThat(parsed.where()).contains("PASSWORD TOKEN secret");
    }

    @Test
    void ORDER_BY는_허용하지_않으므로_민감_칸을_정렬로_알아낼_수_없다() {
        assertThatThrownBy(() -> DbViewerValidator.parseSelect(
                "SELECT CODE_ID FROM MCMAPUSER.T ORDER BY USER_PASS", ALLOWED))
                .isInstanceOf(DbViewerException.class);
        assertThatThrownBy(() -> DbViewerValidator.parseSelect(
                "SELECT CODE_ID FROM MCMAPUSER.T WHERE A = 'x' ORDER BY CODE_ID", ALLOWED))
                .isInstanceOf(DbViewerException.class);
    }

    @Test
    void JOIN_괄호_서브쿼리로_다른_표를_끼워_넣을_수_없다() {
        for (String sql : new String[]{
                "SELECT A FROM MCMAPUSER.T JOIN MCMAPUSER.TB_SEC_KEY_STORE ON 1=1",
                "SELECT A FROM MCMAPUSER.T, MCMAPUSER.TB_SEC_KEY_STORE",
                "SELECT A FROM (SELECT * FROM MCMAPUSER.TB_SEC_KEY_STORE)",
                "SELECT A FROM MCMAPUSER.T WHERE A IN (SELECT B FROM MCMAPUSER.TB_SEC_KEY_STORE)",
                "SELECT A FROM MCMAPUSER.T WHERE A = 'x' FROM MCMAPUSER.TB_SEC_KEY_STORE"}) {
            try {
                DbViewerValidator.ParsedQuery parsed = DbViewerValidator.parseSelect(sql, ALLOWED);
                // 쉼표 조인은 FROM 첫 표만 남기고 나머지는 재조립 SQL 에 들어가지 않는다.
                String rebuilt = DbViewerValidator.buildSql(parsed, parsed.columns(), 200);
                assertThat(rebuilt).as(sql).doesNotContain("TB_SEC_KEY_STORE");
            } catch (DbViewerException expected) {
                assertThat(expected.getStatusCode().value()).isEqualTo(400);
            }
        }
    }
}
