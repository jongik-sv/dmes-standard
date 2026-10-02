package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.day;
import static org.assertj.core.api.Assertions.assertThat;

/** 화면별 — 집계+원본 합산, 완전 일치 조건, 평균(열람 0 이면 null), 메뉴 없음. */
class ScreenUsageByScreenQueryJpaTest extends ScreenUsageStatJpaTestBase {

    private ScreenUsageByScreenQuery query;

    @BeforeEach
    void setUpQuery() {
        query = new ScreenUsageByScreenQuery(support);
    }

    @Test
    @DisplayName("오늘분은 원본에서 합산해 집계분에 더하고, 집계된 날은 이중으로 세지 않는다")
    void todayFromRawPlusAggregated() {
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 60_000);
        save("userB", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 10, 0), 120_000);
        rollupAtTwoAm();
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 30_000);
        save("userA", "D100", USER, "SWITCH", LocalDateTime.of(2026, 10, 3, 9, 30), 30_000);

        assertThat(query.byScreen(req("20261002", "20261003"))).singleElement().satisfies(row ->
                assertThat(row).containsEntry("pageId", USER)
                        .containsEntry("menuNm", "사용자 관리")
                        .containsEntry("menuPath", "공통관리 > 시스템관리")
                        .containsEntry("openCnt", 3L)
                        .containsEntry("userCnt", 2L)
                        .containsEntry("durationMs", 240_000L)
                        .containsEntry("avgDurationMs", 80_000L)
                        .containsEntry("lastUsedDt", "20261003"));
        assertThat(query.byScreen(req("20261002", "20261002")).get(0))
                .containsEntry("openCnt", 2L).containsEntry("durationMs", 180_000L);
        assertThat(query.byScreen(req("20261003", "20261003")).get(0))
                .containsEntry("openCnt", 1L).containsEntry("durationMs", 60_000L);
    }

    @Test
    @DisplayName("02시 집계 전에도 집계되지 않은 어제분은 원본에서 더해져 빠지지 않는다")
    void beforeRollupYesterdayStillCounted() {
        dayRepository.save(day("20261001", USER, "userA", "D100", 1, 1, 10_000)); // 10-01 까지만 집계됨
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 15, 0), 20_000);
        save("userB", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 0, 30), 5_000);

        assertThat(query.byScreen(req("20261001", "20261003")).get(0))
                .containsEntry("openCnt", 3L)
                .containsEntry("durationMs", 35_000L)
                .containsEntry("userCnt", 2L)
                .containsEntry("lastUsedDt", "20261003");
    }

    @Test
    @DisplayName("조건은 완전 일치 — userId·pageId 앞부분 일치는 걸리지 않고, deptCd '-' 는 집계 '-'·원본 NULL 만 거른다")
    void exactMatchFilters() {
        save("userA", null, USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        save("userAB", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        rollupAtTwoAm();                                                                 // 집계 deptCd '-'
        save("userA", null, USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);   // 원본 NULL
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 30), 1_000);

        ScreenUsageStatRequest noDept = req("20261002", "20261003");
        noDept.setDeptCd("-");
        assertThat(query.byScreen(noDept).get(0)).containsEntry("openCnt", 2L).containsEntry("userCnt", 1L);

        ScreenUsageStatRequest userPrefix = req("20261002", "20261003");
        userPrefix.setUserId("user");
        assertThat(query.byScreen(userPrefix)).isEmpty();

        ScreenUsageStatRequest pagePrefix = req("20261002", "20261003");
        pagePrefix.setPageId("csa/commUser");
        assertThat(query.byScreen(pagePrefix)).isEmpty();

        ScreenUsageStatRequest userA = req("20261002", "20261003");
        userA.setUserId("userA");
        assertThat(query.byScreen(userA).get(0)).containsEntry("openCnt", 3L).containsEntry("userCnt", 1L);
    }

    @Test
    @DisplayName("부서 조건은 집계분과 원본분 모두에 적용된다 (부서별 탭의 선택 부서 화면별)")
    void deptFilter() {
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        save("userB", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        rollupAtTwoAm();
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);
        save("userB", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);
        ScreenUsageStatRequest r = req("20261002", "20261003");
        r.setDeptCd("D100");

        assertThat(query.byScreen(r).get(0)).containsEntry("openCnt", 2L).containsEntry("userCnt", 1L);
    }

    @Test
    @DisplayName("열람(OPEN) 없이 전환·재개 구간만 있으면 평균 이용 시간은 null")
    void avgDurationMsNullWhenNoOpen() {
        save("userA", "D100", USER, "SWITCH", LocalDateTime.of(2026, 10, 3, 9, 0), 30_000);
        save("userA", "D100", USER, "RESUME", LocalDateTime.of(2026, 10, 3, 9, 30), 10_000);

        assertThat(query.byScreen(req("20261003", "20261003"))).singleElement().satisfies(row ->
                assertThat(row).containsEntry("openCnt", 0L)
                        .containsEntry("durationMs", 40_000L)
                        .containsEntry("avgDurationMs", null));
    }

    @Test
    @DisplayName("메뉴에서 지워진 화면은 (메뉴 없음)·메뉴 경로 null 로 보인다 (Review Focus 1)")
    void unknownMenu() {
        save("userX", null, "old/removedScreen", "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        rollupAtTwoAm();
        save("userX", null, "old/removedScreen", "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);

        assertThat(query.byScreen(req("20261002", "20261003"))).singleElement().satisfies(row ->
                assertThat(row).containsEntry("menuNm", "(메뉴 없음)").containsEntry("menuPath", null)
                        .containsEntry("openCnt", 2L));
    }

    @Test
    @DisplayName("정렬은 열람 많은 순 → 이용 시간 긴 순 → pageId")
    void sortOrder() {
        save("userA", "D100", ROLE, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);
        save("userA", "D100", MENU, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 1), 5_000);
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 2), 1_000);
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 3), 1_000);

        assertThat(query.byScreen(req("20261003", "20261003")))
                .extracting(r -> r.get("pageId")).containsExactly(USER, MENU, ROLE);
    }

    @Test
    @DisplayName("부서 조건 '-' 는 부서 없음만, 존재하지 않는 부서는 빈 목록 (S3 선택 부서 화면별)")
    void deptFilterNoDeptAndUnknown() {
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);
        save("userB", null, MENU, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);
        ScreenUsageStatRequest none = req("20261003", "20261003");
        none.setDeptCd("-");
        assertThat(query.byScreen(none)).singleElement()
                .satisfies(row -> assertThat(row).containsEntry("pageId", MENU));
        ScreenUsageStatRequest d = req("20261003", "20261003");
        d.setDeptCd("D10");
        assertThat(query.byScreen(d)).isEmpty();
    }

    @Test
    @DisplayName("평균이 null 인 행(열람 0)과 값이 있는 행이 섞여도 정렬이 깨지지 않는다")
    void sortWithNullAverage() {
        save("userA", "D100", ROLE, "SWITCH", LocalDateTime.of(2026, 10, 3, 9, 0), 9_000);
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 1), 1_000);

        assertThat(query.byScreen(req("20261003", "20261003")))
                .extracting(r -> r.get("pageId")).containsExactly(USER, ROLE);
        assertThat(query.byScreen(req("20261003", "20261003")).get(1)).containsEntry("avgDurationMs", null);
    }
}
