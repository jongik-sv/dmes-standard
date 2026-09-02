package com.dongkuk.dmes.mcm.common.audit;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link McmAuditStatementInspector} 의 SQLite 토큰 치환 회귀 테스트 (2026-08-07).
 *
 * <p>회귀 대상 — 구 구현 {@code replaceAll("(?<![A-Za-z0-9_])N'", "'")} 은 MSSQL 유니코드 접두
 * {@code N'...'} 을 지우려다 <b>값 {@code 'N'} 까지 {@code ''} 로 바꿔버렸다.</b>
 * 그 결과 {@code SET USE_TP = 'N'} 이 빈 문자열로 저장돼 commMenuMng 화면 전체가 죽었다.
 */
class McmAuditStatementInspectorSqliteTest {

    private final McmAuditStatementInspector inspector = new McmAuditStatementInspector();

    @BeforeEach
    void enableSqlite() {
        McmAuditStatementInspector.setSqlite(true);
    }

    @AfterEach
    void resetSqlite() {
        McmAuditStatementInspector.setSqlite(false);
    }

    @Test
    @DisplayName("값 'N' 은 보존된다 — 접두 제거가 리터럴 내용을 먹지 않는다")
    void keepsLiteralN() {
        String out = inspector.inspect(
                "UPDATE MCMAPUSER.TB_MCM_SEC_MENU SET USE_TP = 'N' WHERE MENU_ID = 'faiBoard'");
        assertThat(out).contains("USE_TP = 'N'");
        assertThat(out).doesNotContain("USE_TP = ''");
    }

    @Test
    @DisplayName("IN ('Y','N') 비교도 그대로 유지된다")
    void keepsLiteralNInList() {
        String out = inspector.inspect(
                "SELECT MENU_ID FROM MCMAPUSER.TB_MCM_SEC_MENU WHERE USE_TP IN ('Y','N')");
        assertThat(out).contains("IN ('Y','N')");
    }

    @Test
    @DisplayName("MSSQL 유니코드 접두 N'...' 은 제거된다")
    void stripsUnicodePrefix() {
        String out = inspector.inspect(
                "SELECT * FROM MCMAPUSER.TB_MCM_SEC_MENU WHERE MENU_NM = N'메뉴 관리'");
        assertThat(out).contains("MENU_NM = '메뉴 관리'");
        assertThat(out).doesNotContain("N'메뉴 관리'");
    }

    @Test
    @DisplayName("컬럼명이 N 으로 끝나도 접두로 오인하지 않는다")
    void doesNotTouchColumnEndingWithN() {
        String out = inspector.inspect(
                "SELECT MENU_VIEW_YN FROM MCMAPUSER.TB_MCM_SEC_MENU WHERE MENU_VIEW_YN = 'Y'");
        assertThat(out).contains("MENU_VIEW_YN = 'Y'");
    }

    @Test
    @DisplayName("schema 접두 / SYSDATETIME / ISNULL 치환은 기존대로 동작한다")
    void keepsOtherSqliteRewrites() {
        String out = inspector.inspect(
                "UPDATE MCMAPUSER.TB_MCM_SEC_MENU SET U_AT = SYSDATETIME(), "
                        + "VER = ISNULL(VER, 0) + 1 WHERE MENU_ID = 'x'");
        assertThat(out).doesNotContain("MCMAPUSER.");
        assertThat(out).contains("CURRENT_TIMESTAMP");
        assertThat(out).contains("IFNULL(VER, 0)");
    }
}
