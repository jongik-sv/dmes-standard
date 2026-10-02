package com.dongkuk.dmes.mcm.screenusage.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

/** 부서별 — 부서명·이용자 수·최다 이용 화면, 부서 없음은 '-'/(부서 없음), 메뉴 없음(Review Focus 1). */
class ScreenUsageByDeptQueryJpaTest extends ScreenUsageStatJpaTestBase {

    private ScreenUsageByDeptQuery query;

    @BeforeEach
    void setUpQuery() {
        query = new ScreenUsageByDeptQuery(support);
    }

    @Test
    @DisplayName("부서별 — 부서명·이용자 수·최다 이용 화면, 부서 없음은 '-'/(부서 없음)")
    void byDept() {
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 60_000);
        save("userA", "D100", MENU, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 10), 10_000);
        save("userA", "D100", MENU, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 20), 10_000);
        save("userA", "D100", MENU, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 25), 10_000);
        save("userB", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 30), 30_000);
        save("userC", null, USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 40), 5_000);

        List<Map<String, Object>> rows = query.byDept(req("20261003", "20261003"));

        assertThat(rows).extracting(r -> r.get("deptCd"), r -> r.get("deptNm"), r -> r.get("userCnt"),
                        r -> r.get("openCnt"), r -> r.get("durationMs"), r -> r.get("topPageId"), r -> r.get("topMenuNm"))
                .containsExactly(
                        tuple("D100", "생산관리팀", 2L, 5L, 120_000L, MENU, "메뉴 관리"),
                        tuple("-", "(부서 없음)", 1L, 1L, 5_000L, USER, "사용자 관리"));
    }

    @Test
    @DisplayName("최다 이용 화면 동률은 이용 시간 긴 화면, 그것도 같으면 pageId 앞선 화면")
    void topPageTieBreak() {
        save("userA", "D100", ROLE, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 1), 5_000);
        save("userA", "D200", MENU, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 2), 1_000);
        save("userA", "D200", ROLE, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 3), 1_000);

        assertThat(query.byDept(req("20261003", "20261003")))
                .extracting(r -> r.get("deptCd"), r -> r.get("topPageId"))
                .containsExactly(tuple("D100", USER), tuple("D200", MENU));
    }

    @Test
    @DisplayName("메뉴에서 지워진 화면·부서 없는 사용자 — '-'·(부서 없음)·(메뉴 없음), 집계분과 원본분을 합친다")
    void unknownMenuAndNoDept() {
        save("userX", null, "old/removedScreen", "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        rollupAtTwoAm();
        save("userX", null, "old/removedScreen", "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);

        assertThat(query.byDept(req("20261002", "20261003"))).singleElement().satisfies(row ->
                assertThat(row).containsEntry("deptCd", "-").containsEntry("deptNm", "(부서 없음)")
                        .containsEntry("openCnt", 2L).containsEntry("userCnt", 1L)
                        .containsEntry("topPageId", "old/removedScreen")
                        .containsEntry("topMenuNm", "(메뉴 없음)"));
    }

    @Test
    @DisplayName("부서 마스터에 없는 부서코드는 부서명 null")
    void unknownDeptName() {
        save("userA", "D999", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);

        assertThat(query.byDept(req("20261003", "20261003"))).singleElement()
                .satisfies(row -> assertThat(row).containsEntry("deptCd", "D999").containsEntry("deptNm", null));
    }
}
