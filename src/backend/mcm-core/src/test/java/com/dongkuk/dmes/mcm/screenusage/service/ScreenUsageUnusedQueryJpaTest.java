package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;

import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.day;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

/** 미사용 화면 — 오늘 포함 최근 N일 이용 기록이 없는 표시 메뉴. 개요 미사용 수와 같은 규칙(F 의 unusedScreens). */
class ScreenUsageUnusedQueryJpaTest extends ScreenUsageStatJpaTestBase {

    private ScreenUsageUnusedQuery query;

    @BeforeEach
    void setUpQuery() {
        query = new ScreenUsageUnusedQuery(support);
    }

    @Test
    @DisplayName("미사용 — 창 시작일 당일 이용은 사용, 원본 SWITCH 도 이용, 기간 파라미터 없이 기본 90일")
    void unusedBoundary() {
        addMenu(PERM, "권한 관리", true);
        // 오늘 10-03, 90일 창 시작 = 10-03 - 89일 = 2026-07-06
        dayRepository.save(day("20260706", USER, "userA", "D100", 1, 1, 1_000)); // 창 시작일 → 사용
        dayRepository.save(day("20260705", MENU, "userA", "D100", 1, 1, 1_000)); // 창 밖 → 미사용
        save("userA", "D100", PERM, "SWITCH", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000); // 원본·SWITCH 도 이용

        ScreenUsageStatRequest r90 = new ScreenUsageStatRequest();
        r90.setUnusedDays(90);
        assertThat(query.unused(r90))
                .extracting(r -> r.get("pageId"), r -> r.get("menuNm"), r -> r.get("menuPath"), r -> r.get("lastUsedDt"))
                .containsExactly(
                        tuple(MENU, "메뉴 관리", "공통관리 > 시스템관리", "20260705"),
                        tuple(ROLE, "역할 관리", "공통관리 > 시스템관리", null));

        assertThat(query.unused(new ScreenUsageStatRequest())).hasSize(2); // 기본 90일, 기간 파라미터 불필요

        ScreenUsageStatRequest r89 = new ScreenUsageStatRequest();
        r89.setUnusedDays(89); // 창 시작 07-07 → USER 도 미사용
        assertThat(query.unused(r89)).extracting(r -> r.get("pageId")).containsExactly(MENU, ROLE, USER);
    }

    @Test
    @DisplayName("표시하지 않는 메뉴(MENU_VIEW_YN·USE_TP 가 Y 아님)는 이용이 없어도 미사용 목록에 없다")
    void hiddenMenuExcluded() {
        assertThat(query.unused(new ScreenUsageStatRequest())).extracting(r -> r.get("pageId"))
                .containsExactly(MENU, ROLE, USER)
                .doesNotContain(HIDDEN);
    }

    @Test
    @DisplayName("기간 파라미터가 형식에 맞지 않아도 무시한다(unused 는 기간을 쓰지 않는다)")
    void ignoresPeriod() {
        ScreenUsageStatRequest r = new ScreenUsageStatRequest();
        r.setFromDt("bad");
        r.setToDt("20000101");
        assertThat(query.unused(r)).hasSize(3);
    }

    @Test
    @DisplayName("SWITCH 구간만 있는 화면도 이용한 화면이라 미사용이 아니다")
    void switchOnlyIsNotUnused() {
        save("userA", "D100", USER, "SWITCH", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);

        assertThat(query.unused(new ScreenUsageStatRequest()))
                .extracting(r -> r.get("pageId"))
                .containsExactly(MENU, ROLE);
    }

    @Test
    @DisplayName("집계 테이블이 비고 원본만 있어도 lastUsedDt 는 원본의 마지막 이용일이다(findMinStartedAt 분기)")
    void lastUsedDtFromRawOnlyWhenDayTableEmpty() {
        assertThat(dayRepository.findMaxUsageDt()).isNull();
        save("userA", "D100", MENU, "OPEN", LocalDateTime.of(2026, 9, 18, 9, 0), 1_000);
        save("userA", "D100", MENU, "OPEN", LocalDateTime.of(2026, 9, 20, 23, 30), 1_000); // 마지막
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000); // 창 안 → 사용

        ScreenUsageStatRequest r = new ScreenUsageStatRequest();
        r.setUnusedDays(5); // 창 시작 09-29
        assertThat(query.unused(r))
                .extracting(x -> x.get("pageId"), x -> x.get("lastUsedDt"))
                .containsExactly(tuple(MENU, "20260920"), tuple(ROLE, null));
    }
}
