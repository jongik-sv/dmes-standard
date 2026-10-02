package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.repository.UsageSum;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.Filter;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.Range;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.UnusedScreen;
import com.dongkuk.dmes.mcm.screenusage.service.ScreenUsageStatSupport.UsageTotals;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;
import java.util.Set;

import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.day;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** 공통 헬퍼 — 기간 검증, 집계+원본 합산 경계(Review Focus 4), 완전 일치 조건(2), 미사용 판정, 이름 해석(1). */
class ScreenUsageStatSupportJpaTest extends ScreenUsageStatJpaTestBase {

    private List<UsageSum> sums(ScreenUsageStatRequest r) {
        return support.sums(ScreenUsageStatSupport.range(r), ScreenUsageStatSupport.filter(r));
    }

    @Test
    @DisplayName("기간 검증 — 누락은 REQUIRED_VALUE, 역전·형식 오류는 INVALID_VALUE")
    void validatesRange() {
        assertThat(assertThrows(BusinessException.class, () -> ScreenUsageStatSupport.range(req(null, "20261003")))
                .getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE);
        assertThat(assertThrows(BusinessException.class, () -> ScreenUsageStatSupport.range(req("20261003", " ")))
                .getErrorCode()).isEqualTo(ErrorCode.REQUIRED_VALUE);
        assertThat(assertThrows(BusinessException.class, () -> ScreenUsageStatSupport.range(req("20261003", "20261002")))
                .getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE);
        assertThat(assertThrows(BusinessException.class, () -> ScreenUsageStatSupport.range(req("2026-10-01", "20261003")))
                .getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE);
        assertThat(ScreenUsageStatSupport.range(req(" 20261001 ", "20261003")))
                .isEqualTo(new Range(LocalDate.of(2026, 10, 1), LocalDate.of(2026, 10, 3)));
    }

    @Test
    @DisplayName("조건은 공백이면 null, 값은 앞뒤 공백만 지운다")
    void filterTrims() {
        ScreenUsageStatRequest r = req("20261001", "20261003");
        r.setDeptCd(" ");
        r.setUserId(" userA ");
        assertThat(ScreenUsageStatSupport.filter(r)).isEqualTo(new Filter(null, "userA", null));
    }

    @Test
    @DisplayName("집계된 날은 집계 테이블, 그 다음 날부터(오늘 포함)는 원본 — 겹치지 않는다")
    void sumsSplitAggregatedAndRaw() {
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 60_000);
        save("userB", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 10, 0), 120_000);
        rollupAtTwoAm();
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 30_000);
        save("userA", "D100", USER, "SWITCH", LocalDateTime.of(2026, 10, 3, 9, 30), 30_000);

        assertThat(sums(req("20261002", "20261003"))).containsExactlyInAnyOrder(
                new UsageSum(USER, "userA", "D100", 1L, 1L, 60_000L, "20261002"),
                new UsageSum(USER, "userB", "D200", 1L, 1L, 120_000L, "20261002"),
                new UsageSum(USER, "userA", "D100", 1L, 2L, 60_000L, "20261003"));
        assertThat(sums(req("20261003", "20261003")))
                .containsExactly(new UsageSum(USER, "userA", "D100", 1L, 2L, 60_000L, "20261003"));
        assertThat(sums(req("20261002", "20261002"))).hasSize(2);
    }

    @Test
    @DisplayName("02시 집계 전에도 집계되지 않은 어제분은 원본에서 더해진다")
    void beforeRollupYesterdayStillCounted() {
        dayRepository.save(day("20261001", USER, "userA", "D100", 1, 1, 10_000)); // 10-01 까지만 집계됨
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 15, 0), 20_000);
        save("userB", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 0, 30), 5_000);

        assertThat(sums(req("20261001", "20261003")))
                .extracting(UsageSum::userId, UsageSum::lastUsedDt, UsageSum::durationMs)
                .containsExactlyInAnyOrder(
                        tuple("userA", "20261001", 10_000L),
                        tuple("userA", "20261002", 20_000L),
                        tuple("userB", "20261003", 5_000L));
    }

    @Test
    @DisplayName("조건은 완전 일치 — 앞부분 일치는 걸리지 않고, deptCd '-' 는 집계 '-'·원본 NULL 만 거른다")
    void exactMatchFilters() {
        save("userA", null, USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        save("userAB", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        rollupAtTwoAm();                                                                 // 집계 deptCd '-'
        save("userA", null, USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);   // 원본 NULL
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 30), 1_000);

        ScreenUsageStatRequest noDept = req("20261002", "20261003");
        noDept.setDeptCd("-");
        assertThat(sums(noDept)).extracting(UsageSum::userId, UsageSum::deptCd, UsageSum::lastUsedDt)
                .containsExactlyInAnyOrder(tuple("userA", "-", "20261002"), tuple("userA", "-", "20261003"));

        ScreenUsageStatRequest userPrefix = req("20261002", "20261003");
        userPrefix.setUserId("user");
        assertThat(sums(userPrefix)).isEmpty();

        ScreenUsageStatRequest pagePrefix = req("20261002", "20261003");
        pagePrefix.setPageId("csa/commUser");
        assertThat(sums(pagePrefix)).isEmpty();

        ScreenUsageStatRequest userA = req("20261002", "20261003");
        userA.setUserId("userA");
        assertThat(sums(userA)).hasSize(3).extracting(UsageSum::userId).containsOnly("userA");
    }

    @Test
    @DisplayName("미사용 판정 — 표시 메뉴 중 오늘 포함 최근 N일 이용 기록 없음, 창 시작일 당일은 사용, 원본 SWITCH 도 이용")
    void unusedScreensRule() {
        addMenu(PERM, "권한 관리", true);
        // 오늘 10-03, 90일 창 시작 = 2026-07-06
        dayRepository.save(day("20260706", USER, "userA", "D100", 1, 1, 1_000)); // 창 시작일 → 사용
        dayRepository.save(day("20260705", MENU, "userA", "D100", 1, 1, 1_000)); // 창 밖 → 미사용
        save("userA", "D100", PERM, "SWITCH", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000); // 원본·SWITCH → 사용

        assertThat(support.unusedScreens(support.menus(), 90))
                .extracting(u -> u.menu().pageId(), UnusedScreen::lastUsedDt)
                .containsExactly(tuple(MENU, "20260705"), tuple(ROLE, null)); // HIDDEN 은 표시 안 함이라 제외
        assertThat(support.unusedScreens(support.menus(), 89))
                .extracting(u -> u.menu().pageId())
                .containsExactly(MENU, ROLE, USER);
    }

    @Test
    @DisplayName("이름 해석 — 메뉴 없음·부서 없음 문구, 부서 '-' 는 조회하지 않음, 기준 일수 기본 90")
    void namesAndMissing() {
        Map<String, String> deptNames = support.deptNames(Set.of("-", "D100"));

        assertThat(deptNames).containsExactly(Map.entry("D100", "생산관리팀"));
        assertThat(ScreenUsageStatSupport.deptName("-", deptNames)).isEqualTo("(부서 없음)");
        assertThat(ScreenUsageStatSupport.deptName("D999", deptNames)).isNull();
        assertThat(ScreenUsageStatSupport.menuNm("old/removedScreen", support.menus())).isEqualTo("(메뉴 없음)");
        assertThat(ScreenUsageStatSupport.menuNm(USER, support.menus())).isEqualTo("사용자 관리");
        assertThat(support.userNames(Set.of("userA"))).containsEntry("userA", "김철수");
        assertThat(support.userNames(Set.of())).isEmpty();

        ScreenUsageStatRequest r = new ScreenUsageStatRequest();
        assertThat(ScreenUsageStatSupport.unusedDays(r)).isEqualTo(90);
        r.setUnusedDays(0);
        assertThat(ScreenUsageStatSupport.unusedDays(r)).isEqualTo(90);
        r.setUnusedDays(30);
        assertThat(ScreenUsageStatSupport.unusedDays(r)).isEqualTo(30);
    }

    @Test
    @DisplayName("묶음 합산 — 열람·시간 합계, 이용자 수(중복 제거), 마지막 이용일 최대값")
    void groupByTotals() {
        Map<String, UsageTotals> byPage = ScreenUsageStatSupport.groupBy(List.of(
                        new UsageSum(USER, "userA", "D100", 1L, 1L, 1_000L, "20261001"),
                        new UsageSum(USER, "userA", "-", 2L, 2L, 2_000L, "20261003"),
                        new UsageSum(USER, "userB", "D100", 0L, 1L, 500L, "20261002"),
                        new UsageSum(MENU, "userA", "D100", 1L, 1L, 100L, "20261002")),
                UsageSum::pageId, UsageTotals::new);

        assertThat(byPage).containsOnlyKeys(USER, MENU);
        UsageTotals user = byPage.get(USER);
        assertThat(user.openCnt).isEqualTo(3L);
        assertThat(user.durationMs).isEqualTo(3_500L);
        assertThat(user.users).containsExactlyInAnyOrder("userA", "userB");
        assertThat(user.lastUsedDt).isEqualTo("20261003");
    }
}
