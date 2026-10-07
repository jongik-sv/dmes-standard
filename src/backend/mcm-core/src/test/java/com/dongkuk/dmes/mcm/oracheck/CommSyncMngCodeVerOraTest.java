package com.dongkuk.dmes.mcm.oracheck;

import com.dongkuk.dmes.mcm.csa.commSyncMng.dto.CommSyncMngRegRequest;
import com.dongkuk.dmes.mcm.csa.commSyncMng.service.CommSyncMngService;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionTemplate;

import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * commSyncMng 동기화의 CODE_VER 증가식(oracle-1007 c2)을 실제 Oracle 에서 확인한다.
 *
 * <p>식: {@code TO_CHAR(COALESCE(MAX(CAST(CODE_VER AS DECIMAL(10,1))) + 0.1, 1), 'FM999999990.0')} — 값이 없으면 '1.0',
 * '2' 면 '2.1', '0.4' 면 '0.5' 처럼 예전 MSSQL 결과 형식(소수 한 자리·앞자리 0)을 지켜야 한다.
 *
 * <p>SQL 문자열은 복사하지 않는다. 식을 가진 private 메서드 {@code selectNextCodeVer} 를 리플렉션
 * ({@link ReflectionTestUtils#invokeMethod})으로 부르고, 전체 경로는 공개 {@code reg} 로 한 번 더 돌린다
 * (원장 CODE_VER 갱신 → 사본 DELETE/INSERT SELECT * → audit UPDATE).
 */
@SpringJUnitConfig(OraCheckJpaConfig.class)
class CommSyncMngCodeVerOraTest {

    @Autowired CommSyncMngService service;
    @Autowired JdbcTemplate jdbc;
    @Autowired TransactionTemplate tx;

    private static final List<String> TABLES = List.of(
            "MCM_SOURCE.TB_MCM_CODE_MASTER", "MCM_SOURCE.TB_MCM_CODE_DETAIL", "MCM_SOURCE.TB_MCM_CODE_CATEGORY",
            "MCMAPUSER.TB_MCM_CODE_MASTER", "MCMAPUSER.TB_MCM_CODE_DETAIL", "MCMAPUSER.TB_MCM_CODE_CATEGORY");

    @BeforeEach
    @AfterEach
    void clean() {
        for (String t : TABLES) jdbc.update("DELETE FROM " + t);
    }

    private void sourceMaster(String masterCode, String codeVer) {
        jdbc.update("INSERT INTO MCM_SOURCE.TB_MCM_CODE_MASTER (CODE_ID, MASTER_CODE, CODE_VER, CODE_NM, USE_TP) VALUES (?, ?, ?, ?, 'Y')",
                "ID_" + masterCode, masterCode, codeVer, masterCode + "-nm");
    }

    private String nextVer(String masterCode) {
        return ReflectionTestUtils.invokeMethod(service, "selectNextCodeVer", masterCode);
    }

    /** c2: CODE_VER 증가식의 값 형식 — 비었을 때·정수·소수·자리올림. */
    @Test
    @DisplayName("selectNextCodeVer — 값 없음 '1.0', '2'→'2.1', '0.4'→'0.5', '1.9'→'2.0', '9.9'→'10.0' (소수 한 자리·앞자리 0 고정)")
    void nextCodeVerFormat() {
        sourceMaster("C4_NULL", null);
        sourceMaster("C4_TWO", "2");
        sourceMaster("C4_04", "0.4");
        sourceMaster("C4_19", "1.9");
        sourceMaster("C4_99", "9.9");

        assertThat(nextVer("C4_NOROW")).as("원장에 행이 없음").isEqualTo("1.0");
        assertThat(nextVer("C4_NULL")).as("CODE_VER 가 NULL").isEqualTo("1.0");
        assertThat(nextVer("C4_TWO")).isEqualTo("2.1");
        assertThat(nextVer("C4_04")).isEqualTo("0.5");
        assertThat(nextVer("C4_19")).isEqualTo("2.0");
        assertThat(nextVer("C4_99")).isEqualTo("10.0");
    }

    /** c2: 같은 마스터코드의 상세 행이 여럿이어도 MAX(CAST) 로 가장 큰 값 기준(원장 마스터 표만 본다). */
    @Test
    @DisplayName("selectNextCodeVer — 같은 MASTER_CODE 의 마스터 행이 여럿이면 가장 큰 값 기준(숫자 비교: '9.5' < '10.0')")
    void nextCodeVerUsesNumericMax() {
        jdbc.update("INSERT INTO MCM_SOURCE.TB_MCM_CODE_MASTER (CODE_ID, MASTER_CODE, CODE_VER) VALUES ('ID_A', 'C4_MAX', '9.5')");
        jdbc.update("INSERT INTO MCM_SOURCE.TB_MCM_CODE_MASTER (CODE_ID, MASTER_CODE, CODE_VER) VALUES ('ID_B', 'C4_MAX', '10.0')");

        assertThat(nextVer("C4_MAX")).isEqualTo("10.1");
    }

    private Map<String, Object> reg(String... masterCodes) {
        CommSyncMngRegRequest request = new CommSyncMngRegRequest();
        request.setPSyncTarget("MASTER");
        List<Map<String, Object>> dsMain = List.of(
                Map.of("CHK", 1, "targetid", "MA1", "from4", "MCM_SOURCE", "to4", "MCMAPUSER"));
        List<Map<String, Object>> dsObject = java.util.Arrays.stream(masterCodes)
                .<Map<String, Object>>map(code -> Map.of("OBJECT", code)).toList();
        return tx.execute(status -> service.reg(request, dsMain, dsObject));
    }

    private String ver(String schema, String masterCode) {
        return jdbc.queryForObject("SELECT CODE_VER FROM " + schema + ".TB_MCM_CODE_MASTER WHERE MASTER_CODE = ?", String.class, masterCode);
    }

    /** c2: 공개 reg 전체 경로 — 원장 CODE_VER 가 증가식 값으로 바뀌고 사본에 그 값이 복사되며 audit 이 덮어써진다. 두 번 돌리면 한 칸씩 더 오른다. */
    @Test
    @DisplayName("reg(MASTER) — 원장 CODE_VER 가 '1.0'·'2.1'·'0.5' 로 오르고 운영 사본에 복사된다, 한 번 더 돌리면 '1.1'")
    void regEndToEnd() {
        sourceMaster("C4_NULL", null);
        sourceMaster("C4_TWO", "2");
        sourceMaster("C4_04", "0.4");

        Map<String, Object> out = reg("C4_NULL", "C4_TWO", "C4_04");

        assertThat(((Number) out.get("cnt_save")).intValue()).isPositive();
        assertThat(ver("MCM_SOURCE", "C4_NULL")).isEqualTo("1.0");
        assertThat(ver("MCM_SOURCE", "C4_TWO")).isEqualTo("2.1");
        assertThat(ver("MCM_SOURCE", "C4_04")).isEqualTo("0.5");
        assertThat(ver("MCMAPUSER", "C4_NULL")).isEqualTo("1.0");
        assertThat(ver("MCMAPUSER", "C4_TWO")).isEqualTo("2.1");
        assertThat(ver("MCMAPUSER", "C4_04")).isEqualTo("0.5");
        assertThat(jdbc.queryForObject("SELECT U_SVC_ID FROM MCMAPUSER.TB_MCM_CODE_MASTER WHERE MASTER_CODE = 'C4_TWO'", String.class))
                .isEqualTo("commSyncMng");
        assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM MCMAPUSER.TB_MCM_CODE_MASTER WHERE U_AT IS NOT NULL", Integer.class)).isEqualTo(3);

        reg("C4_NULL");
        assertThat(ver("MCM_SOURCE", "C4_NULL")).isEqualTo("1.1");
        assertThat(ver("MCMAPUSER", "C4_NULL")).isEqualTo("1.1");
    }
}
