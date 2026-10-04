package com.dongkuk.dmes.mcm.csa.commUserMng.service;

import com.dongkuk.dmes.mcm.csa.commUserMng.dto.CommUserMngSearchRequest;
import com.dongkuk.dmes.mcm.csa.commUserMng.support.SqlStatementCounter;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import jakarta.persistence.EntityManagerFactory;
import org.springframework.beans.factory.annotation.Autowired;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * 성능 근거 — {@link CommUserMngService#searchCmUser} 의 부서명 조회 SQL 수(perf-mcm.md P1).
 *
 * <p>사용자 6명이 부서 3개(있는 부서 D01, 비활성 부서 D02, 없는 부서 D99)를 쓰고 1명은 부서가 없다.
 * 부서 표(TB_MCM_DEPT_INFO) SELECT 는 행 수·부서 수와 무관하게 1회여야 한다.
 * 결과 값은 {@link CommUserMngServiceSearchTest} 가 고정하므로 여기서는 이름 부착만 짧게 확인한다.
 */
class CommUserMngServiceSearchSqlCountTest extends CommUserMngJpaTestBase {

    static final String DEPT_TABLE = "TB_MCM_DEPT_INFO";

    @Autowired EntityManagerFactory emf;

    static LocalDateTime day(int dayOfMonth) {
        return LocalDateTime.of(2026, 1, dayOfMonth, 0, 0);
    }

    @Test
    @DisplayName("사용자 6명·부서 3개(없는 부서·비활성 부서 포함) — 부서 표 SELECT 1회")
    void deptLookupIsOneSelect() {
        fx.dept("D01", "생산팀", "Y");
        fx.dept("D02", "폐지팀", "N");
        fx.user("U1", "D01", day(1));
        fx.user("U2", "D01", day(2));
        fx.user("U3", "D02", day(3));
        fx.user("U4", "D99", day(4));
        fx.user("U5", "D99", day(5));
        fx.user("U6", null, day(6));

        SqlStatementCounter.requireNoJdbcBatching(emf);
        SqlStatementCounter sql = SqlStatementCounter.INSTANCE;
        sql.reset();
        Map<String, Object> out = inTx(() -> service.searchCmUser(new CommUserMngSearchRequest()));
        List<String> seen = sql.statements();
        long deptSelects = sql.count("select", DEPT_TABLE);

        List<Map<String, Object>> main = grid(out, "ds_main");
        assertThat(main).extracting(r -> r.get("DEPT_NM"))
                .containsExactly("생산팀", "생산팀", "폐지팀", null, null, null);
        assertThat(deptSelects).as("부서 표 SELECT 수 — %s", seen).isEqualTo(1);
    }

    @Test
    @DisplayName("부서 코드가 모두 비어 있으면 부서 표를 조회하지 않는다")
    void noDeptCodeNoSelect() {
        fx.user("U1", null, day(1));
        fx.user("U2", " ", day(2));

        SqlStatementCounter sql = SqlStatementCounter.INSTANCE;
        sql.reset();
        inTx(() -> service.searchCmUser(new CommUserMngSearchRequest()));

        assertThat(sql.count("select", DEPT_TABLE)).isZero();
    }
}
