package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.day;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

/** 개요 — 합계·이용자 수(집계·원본 중복 제거)·일별 추이(0 채움)·상위 10개·미사용 수(unusedDays). */
class ScreenUsageOverviewQueryJpaTest extends ScreenUsageStatJpaTestBase {

    private ScreenUsageOverviewQuery query;

    @BeforeEach
    void setUpQuery() {
        query = new ScreenUsageOverviewQuery(support, dayRepository);
    }

    @SuppressWarnings("unchecked")
    private static List<Map<String, Object>> list(Map<String, Object> result, String key) {
        return (List<Map<String, Object>>) result.get(key);
    }

    @Test
    @DisplayName("개요 — 합계·이용자 수·일별 추이(이용 없는 날 0)·상위 화면·미사용 수")
    void overview() {
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 60_000);
        save("userB", "D200", MENU, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 30_000);
        rollupAtTwoAm();
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 30_000);
        save("userA", "D100", MENU, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 10), 10_000);

        Map<String, Object> result = query.overview(req("20261001", "20261003"));

        assertThat(result).containsEntry("totalOpenCnt", 4L)
                .containsEntry("userCnt", 2L)
                .containsEntry("totalDurationMs", 130_000L)
                .containsEntry("unusedScreenCnt", 1L); // ROLE (HIDDEN 은 표시 안 함)
        assertThat(list(result, "daily"))
                .extracting(r -> r.get("usageDt"), r -> r.get("openCnt"), r -> r.get("userCnt"), r -> r.get("durationMs"))
                .containsExactly(
                        tuple("20261001", 0L, 0L, 0L),
                        tuple("20261002", 2L, 2L, 90_000L),
                        tuple("20261003", 2L, 1L, 40_000L));
        assertThat(list(result, "topScreens"))
                .extracting(r -> r.get("pageId"), r -> r.get("menuNm"), r -> r.get("openCnt"), r -> r.get("durationMs"))
                .containsExactly(tuple(USER, "사용자 관리", 2L, 90_000L), tuple(MENU, "메뉴 관리", 2L, 40_000L));
    }

    @Test
    @DisplayName("개요의 미사용 화면 수는 unusedDays(기본 90)를 미사용 탭과 같은 규칙으로 쓴다")
    void overviewUsesUnusedDays() {
        dayRepository.save(day("20260706", ROLE, "userA", "D100", 1, 1, 1_000)); // 90일 창 시작일(07-06) 이용
        ScreenUsageStatRequest r = req("20261003", "20261003");

        assertThat(query.overview(r)).containsEntry("unusedScreenCnt", 2L); // USER, MENU (ROLE 은 사용)
        r.setUnusedDays(89);                                                  // 창 시작 07-07 → ROLE 도 미사용
        assertThat(query.overview(r)).containsEntry("unusedScreenCnt", 3L);
    }

    @Test
    @DisplayName("상위 화면은 열람 많은 순 10개까지, 메뉴에 없는 화면은 (메뉴 없음)")
    void topScreensLimitTen() {
        for (int i = 1; i <= 11; i++) {
            String pageId = String.format("old/screen%02d", i);
            for (int k = 0; k < i; k++) {
                save("userA", "D100", pageId, "OPEN", LocalDateTime.of(2026, 10, 3, 8, k), 1_000);
            }
        }

        List<Map<String, Object>> top = list(query.overview(req("20261003", "20261003")), "topScreens");

        assertThat(top).hasSize(10);
        assertThat(top.get(0)).containsEntry("pageId", "old/screen11").containsEntry("openCnt", 11L)
                .containsEntry("menuNm", "(메뉴 없음)");
        assertThat(top).extracting(r -> r.get("pageId")).doesNotContain("old/screen01");
    }

    @Test
    @DisplayName("집계 테이블이 비어 있고 원본만 있어도(maxDt == null) 원본만으로 값을 낸다")
    void overviewFromRawOnlyWhenNoAggregate() {
        assertThat(dayRepository.findMaxUsageDt()).isNull();
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 60_000);
        save("userB", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 30_000);

        Map<String, Object> result = query.overview(req("20261002", "20261003"));

        assertThat(result).containsEntry("totalOpenCnt", 2L)
                .containsEntry("userCnt", 2L)
                .containsEntry("totalDurationMs", 90_000L);
        assertThat(list(result, "daily"))
                .extracting(r -> r.get("usageDt"), r -> r.get("openCnt"), r -> r.get("userCnt"), r -> r.get("durationMs"))
                .containsExactly(tuple("20261002", 1L, 1L, 60_000L), tuple("20261003", 1L, 1L, 30_000L));
        assertThat(list(result, "topScreens")).extracting(r -> r.get("pageId")).containsExactly(USER);
    }

    @Test
    @DisplayName("이용이 없으면 합계 0, 추이는 오늘까지만 0 으로 채우고 상위 화면은 빈 목록")
    void emptyPeriod() {
        Map<String, Object> result = query.overview(req("20261002", "20261005")); // 종료일이 오늘(10-03) 뒤

        assertThat(result).containsEntry("totalOpenCnt", 0L).containsEntry("userCnt", 0L)
                .containsEntry("totalDurationMs", 0L);
        assertThat(list(result, "daily")).extracting(r -> r.get("usageDt")).containsExactly("20261002", "20261003");
        assertThat(list(result, "topScreens")).isEmpty();
    }
}
