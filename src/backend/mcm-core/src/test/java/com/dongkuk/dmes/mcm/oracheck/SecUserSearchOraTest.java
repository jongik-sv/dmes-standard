package com.dongkuk.dmes.mcm.oracheck;

import com.dongkuk.dmes.mcm.entity.SecUser;
import com.dongkuk.dmes.mcm.repository.SecUserRepository;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.util.List;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link SecUserRepository#searchByFilter} 의 검색어 유무 분기(sargable-1008 s5)가 실제 Oracle 에서 같은 결과를 내는지 확인한다.
 * 검색어가 없으면 가드 없는 쿼리, 있으면 UPPER 앞 일치 3칸 OR 쿼리를 쓰며 대소문자는 무시한다.
 */
@SpringJUnitConfig(OraCheckJpaConfig.class)
class SecUserSearchOraTest {

    private static final String IDS = "'t_s5_kim1', 'T_S5_LEE2', 'T_S5_PARK3'";

    @Autowired SecUserRepository repo;
    @Autowired JdbcTemplate jdbc;

    @BeforeEach
    void insertRows() {
        cleanRows();
        insert("t_s5_kim1", "E5001", "홍길동", "Y", "I");      // 소문자 USER_ID
        insert("T_S5_LEE2", "e5kim2", "Alice", "Y", "I");     // 소문자 사번
        insert("T_S5_PARK3", "E5003", "kimberly", "N", "O");  // 소문자 이름, 사용 안 함
    }

    @AfterEach
    void cleanUp() {
        cleanRows();
    }

    @Test
    @DisplayName("검색어 없음 — 가드 없는 쿼리: 조건(USE_TP·IN_OUT_EMP_TP)만 걸린다")
    void noKey() {
        assertThat(ids(repo.searchByFilter(null, "Y", null))).contains("t_s5_kim1", "T_S5_LEE2").doesNotContain("T_S5_PARK3");
        assertThat(ids(repo.searchByFilter("", null, "O"))).contains("T_S5_PARK3").doesNotContain("t_s5_kim1");
    }

    @Test
    @DisplayName("검색어 있음 — USER_ID·사번·이름 앞 일치, 대소문자 무시")
    void withKey() {
        assertThat(ids(repo.searchByFilter("T_S5_KIM", null, null))).containsExactly("t_s5_kim1");   // 소문자 USER_ID
        assertThat(ids(repo.searchByFilter("E5KIM", null, null))).containsExactly("T_S5_LEE2");      // 소문자 사번
        assertThat(ids(repo.searchByFilter("KIMB", null, null))).containsExactly("T_S5_PARK3");      // 소문자 이름
        assertThat(ids(repo.searchByFilter("kim", null, null))).containsExactly("T_S5_PARK3");       // 앞 일치만: 이름 kimberly (USER_ID t_s5_kim1 은 t_s5 로 시작)
        assertThat(ids(repo.searchByFilter("T_S5", "N", null))).containsExactly("T_S5_PARK3");       // 검색어 + 다른 조건
    }

    private static List<String> ids(List<SecUser> rows) {
        return rows.stream().map(SecUser::getUserId).filter(id -> id.toUpperCase().startsWith("T_S5")).toList();
    }

    private void insert(String userId, String empNo, String nm, String useTp, String inOut) {
        jdbc.update("INSERT INTO MCMAPUSER.TB_MCM_SEC_USER (USER_ID, USER_EMP_NO, USER_NM, USE_TP, IN_OUT_EMP_TP) VALUES (?, ?, ?, ?, ?)",
                userId, empNo, nm, useTp, inOut);
    }

    private void cleanRows() {
        jdbc.update("DELETE FROM MCMAPUSER.TB_MCM_SEC_USER WHERE USER_ID IN (" + IDS + ")");
    }
}
