package com.dongkuk.dmes.mcm.screenusage.service;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;

import java.time.LocalDateTime;
import java.util.List;
import java.util.Map;

import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.day;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.tuple;

/** 사용자별 — 사용자당 1행, 부서는 기간 안 마지막 이용 구간의 부서(C4 보충 3). */
class ScreenUsageByUserQueryJpaTest extends ScreenUsageStatJpaTestBase {

    private ScreenUsageByUserQuery query;

    @BeforeEach
    void setUpQuery() {
        query = new ScreenUsageByUserQuery(support, logRepository);
    }

    @Test
    @DisplayName("사용자별 — 이름·부서·열람·시간·마지막 이용일, 이름 모르는 사용자는 userNm null, 부서 없음은 '-'")
    void byUser() {
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 60_000);
        save("userA", "D100", MENU, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 10), 30_000);
        save("userB", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 30), 30_000);
        save("userC", null, USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 40), 5_000);

        List<Map<String, Object>> rows = query.byUser(req("20261003", "20261003"));

        assertThat(rows).extracting(r -> r.get("userId"), r -> r.get("userNm"), r -> r.get("deptCd"), r -> r.get("deptNm"),
                        r -> r.get("openCnt"), r -> r.get("durationMs"), r -> r.get("lastUsedDt"))
                .containsExactly(
                        tuple("userA", "김철수", "D100", "생산관리팀", 2L, 90_000L, "20261003"),
                        tuple("userB", "이영희", "D100", "생산관리팀", 1L, 30_000L, "20261003"),
                        tuple("userC", null, "-", "(부서 없음)", 1L, 5_000L, "20261003"));
    }

    @Test
    @DisplayName("사용자별 부서는 가장 최근 이용일의 부서이고, 부서가 바뀌어도 사용자당 1행이다")
    void byUserLatestDept() {
        dayRepository.save(day("20261001", USER, "userA", "D100", 1, 1, 1_000));
        save("userA", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);

        assertThat(query.byUser(req("20261001", "20261003"))).singleElement()
                .satisfies(row -> assertThat(row).containsEntry("deptCd", "D200").containsEntry("openCnt", 2L)
                        .containsEntry("durationMs", 2_000L).containsEntry("lastUsedDt", "20261003"));
    }

    @Test
    @DisplayName("마지막 이용일에 부서가 둘이면 그날 가장 늦게 시작한 구간의 부서 (집계분·원본분 모두)")
    void byUserSameDayDeptChange() {
        // 집계분: 10-02 에 D100·D200 두 행 → 시각이 없으므로 그날 원본에서 가장 늦은 구간(15:00, D200)으로 정한다
        dayRepository.save(day("20261002", USER, "userA", "D100", 1, 1, 1_000));
        dayRepository.save(day("20261002", USER, "userA", "D200", 1, 1, 1_000));
        save("userA", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 15, 0), 1_000);
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 2, 9, 0), 1_000);
        assertThat(query.byUser(req("20261002", "20261002"))).singleElement()
                .satisfies(row -> assertThat(row).containsEntry("deptCd", "D200").containsEntry("openCnt", 2L));

        // 원본분(오늘): D050 < D100 이라 코드 순 폴백이면 틀리도록, 저장 순서와 무관하게 시작 시각이 늦은 11:00(D100) 구간의 부서
        save("userB", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 11, 0), 1_000);
        save("userB", "D050", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);
        assertThat(query.byUser(req("20261003", "20261003"))).singleElement()
                .satisfies(row -> assertThat(row).containsEntry("userId", "userB")
                        .containsEntry("deptCd", "D100").containsEntry("deptNm", "생산관리팀"));
    }

    @Test
    @DisplayName("부서 조건을 주면 그 부서 구간만 합산하고 부서도 그 부서다")
    void deptFilterKeepsOneRow() {
        save("userA", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);
        save("userA", "D200", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 10, 0), 1_000);
        var r = req("20261003", "20261003");
        r.setDeptCd("D100");

        assertThat(query.byUser(r)).singleElement()
                .satisfies(row -> assertThat(row).containsEntry("deptCd", "D100").containsEntry("openCnt", 1L));
    }

    @Test
    @DisplayName("사용자 테이블에 없는 userId 도 행은 나오고 userNm 만 null 이다")
    void unknownUserKeepsRow() {
        save("ghost", "D100", USER, "OPEN", LocalDateTime.of(2026, 10, 3, 9, 0), 1_000);

        assertThat(query.byUser(req("20261003", "20261003"))).singleElement()
                .satisfies(row -> assertThat(row).containsEntry("userId", "ghost").containsEntry("userNm", null)
                        .containsEntry("deptCd", "D100"));
    }
}
