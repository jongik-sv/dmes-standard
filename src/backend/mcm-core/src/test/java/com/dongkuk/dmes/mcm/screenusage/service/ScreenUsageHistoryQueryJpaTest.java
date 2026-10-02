package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.common.exception.ErrorCode;
import com.dongkuk.dmes.mcm.screenusage.dto.ScreenUsageStatRequest;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.log;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatCode;
import static org.junit.jupiter.api.Assertions.assertThrows;

/** 이용 이력 — 원본 그대로 최신순, 31일(시작·종료일 포함) 경계, 10,000행 상한, 완전 일치, 메뉴·부서 없음. */
class ScreenUsageHistoryQueryJpaTest extends ScreenUsageStatJpaTestBase {

    private ScreenUsageHistoryQuery query;

    @BeforeEach
    void setUpQuery() {
        query = new ScreenUsageHistoryQuery(support, logRepository);
    }

    @Test
    @DisplayName("원본 그대로 최신순, 이름·부서명·메뉴명을 붙이고 시각은 yyyy-MM-dd HH:mm:ss")
    void historyRows() {
        ScreenUsageLog first = log("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0, 5), 61_000);
        first.setClientIp("10.0.0.7");
        logRepository.save(first);
        save("userB", null, MENU, "RESUME", LocalDateTime.of(2026, 10, 3, 8, 0), 1_000);

        List<Map<String, Object>> rows = query.history(req("20261002", "20261003"));

        assertThat(rows).extracting(r -> r.get("userId")).containsExactly("userB", "userA");
        assertThat(rows.get(1)).containsEntry("usageId", first.getUsageId())
                .containsEntry("userNm", "김철수")
                .containsEntry("deptCd", "D100")
                .containsEntry("deptNm", "생산관리팀")
                .containsEntry("pageId", USER)
                .containsEntry("menuNm", "사용자 관리")
                .containsEntry("startKind", "OPEN")
                .containsEntry("startedAt", "2026-10-02 09:00:05")
                .containsEntry("endedAt", "2026-10-02 09:01:06")
                .containsEntry("durationMs", 61_000L)
                .containsEntry("clientIp", "10.0.0.7");
        assertThat(rows.get(0)).containsEntry("deptCd", "-").containsEntry("deptNm", "(부서 없음)")
                .containsEntry("clientIp", null);
    }

    @Test
    @DisplayName("기간은 시작·종료일 포함 31일까지 — 31일 통과, 32일 INVALID_VALUE (메인 결정 U2-1)")
    void historyPeriodBoundary() {
        assertThatCode(() -> query.history(req("20260903", "20261003"))).doesNotThrowAnyException(); // 31일
        assertThatCode(() -> query.history(req("20261003", "20261003"))).doesNotThrowAnyException(); // 1일
        BusinessException e = assertThrows(BusinessException.class,
                () -> query.history(req("20260902", "20261003")));                                     // 32일
        assertThat(e.getErrorCode()).isEqualTo(ErrorCode.INVALID_VALUE);
        assertThat(e.getMessage()).contains("31일");
    }

    @Test
    @DisplayName("최신순 상한(기본 10,000행)까지만 돌려준다")
    void historyMaxRows() {
        assertThat(ScreenUsageHistoryQuery.HISTORY_MAX_ROWS).isEqualTo(10_000);
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 1), 1_000);
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 2), 1_000);
        ScreenUsageHistoryQuery capped = new ScreenUsageHistoryQuery(support, logRepository, 2);

        assertThat(capped.history(req("20261003", "20261003")))
                .extracting(r -> r.get("startedAt"))
                .containsExactly("2026-10-03 09:02:00", "2026-10-03 09:01:00");
    }

    @Test
    @DisplayName("조건은 완전 일치 — 앞부분 일치는 걸리지 않고, deptCd '-' 는 부서 없는 구간만")
    void exactMatchFilters() {
        save("userA", null, USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        save("userAB", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        save("userA", null, USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 30), 1_000);

        ScreenUsageStatRequest noDept = req("20261002", "20261003");
        noDept.setDeptCd("-");
        assertThat(query.history(noDept)).hasSize(2).allSatisfy(row -> assertThat(row).containsEntry("deptCd", "-"));

        ScreenUsageStatRequest userPrefix = req("20261002", "20261003");
        userPrefix.setUserId("user");
        assertThat(query.history(userPrefix)).isEmpty();

        ScreenUsageStatRequest pagePrefix = req("20261002", "20261003");
        pagePrefix.setPageId("csa/commUser");
        assertThat(query.history(pagePrefix)).isEmpty();

        ScreenUsageStatRequest userA = req("20261002", "20261003");
        userA.setUserId("userA");
        assertThat(query.history(userA)).hasSize(3);
    }

    @Test
    @DisplayName("메뉴에서 지워진 화면·부서 없는 사용자 — (메뉴 없음)·'-'·(부서 없음) (Review Focus 1)")
    void unknownMenuAndNoDept() {
        save("userX", null, "old/removedScreen", "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        save("userX", null, "old/removedScreen", "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);

        assertThat(query.history(req("20261002", "20261003"))).hasSize(2).allSatisfy(row ->
                assertThat(row).containsEntry("deptCd", "-").containsEntry("deptNm", "(부서 없음)")
                        .containsEntry("menuNm", "(메뉴 없음)").containsEntry("userNm", null));
    }
}
