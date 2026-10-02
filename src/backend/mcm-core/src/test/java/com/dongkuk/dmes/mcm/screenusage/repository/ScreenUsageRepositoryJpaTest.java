package com.dongkuk.dmes.mcm.screenusage.repository;

import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import com.dongkuk.dmes.mcm.screenusage.support.ScreenUsageJpaTestConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.data.domain.PageRequest;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.time.LocalDateTime;
import java.util.List;

import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.day;
import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.log;
import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

@SpringJUnitConfig(ScreenUsageJpaTestConfig.class)
class ScreenUsageRepositoryJpaTest {

    @Autowired ScreenUsageLogRepository logRepository;
    @Autowired ScreenUsageDayRepository dayRepository;

    @BeforeEach
    void clean() {
        logRepository.deleteAllInBatch();
        dayRepository.deleteAllInBatch();
    }

    private static LocalDateTime at(int month, int day, int hour, int minute, int second) {
        return LocalDateTime.of(2026, month, day, hour, minute, second);
    }

    @Test
    @DisplayName("같은 사용자의 같은 clientSegId 는 고유 제약 (USER_ID, CLIENT_SEG_ID) 이 막는다")
    void uniqueUserSegment() {
        ScreenUsageLog first = log("userA", "D100", "csa/commUserMng", "OPEN", at(10, 2, 9, 0, 0), 60_000);
        logRepository.saveAndFlush(first);
        ScreenUsageLog dup = log("userA", "D100", "csa/commUserMng", "OPEN", at(10, 2, 9, 5, 0), 60_000);
        dup.setClientSegId(first.getClientSegId());

        assertThatThrownBy(() -> logRepository.saveAndFlush(dup))
                .isInstanceOf(DataIntegrityViolationException.class);
    }

    @Test
    @DisplayName("이미 저장된 clientSegId 조회는 그 사용자 것만 돌려준다")
    void existingSegIdsPerUser() {
        ScreenUsageLog a = logRepository.save(log("userA", "D100", "p/a", "OPEN", at(10, 2, 9, 0, 0), 1_000));
        ScreenUsageLog b = logRepository.save(log("userB", "D100", "p/a", "OPEN", at(10, 2, 9, 0, 0), 1_000));

        assertThat(logRepository.findExistingClientSegIds("userA",
                List.of(a.getClientSegId(), b.getClientSegId(), "none")))
                .containsExactly(a.getClientSegId());
    }

    @Test
    @DisplayName("시작 시각 범위는 시작 포함·끝 제외이고, 최소 시각·보관 삭제도 그 경계를 따른다")
    void startedRangeMinAndPurge() {
        logRepository.saveAll(List.of(
                log("userA", "D100", "p/a", "OPEN", at(10, 1, 23, 59, 59), 1_000),
                log("userA", "D100", "p/a", "OPEN", at(10, 2, 0, 0, 0), 1_000),
                log("userA", "D100", "p/a", "OPEN", at(10, 2, 23, 59, 59), 1_000),
                log("userA", "D100", "p/a", "OPEN", at(10, 3, 0, 0, 0), 1_000)));

        assertThat(logRepository.findStartedBetween(at(10, 2, 0, 0, 0), at(10, 3, 0, 0, 0)))
                .extracting(ScreenUsageLog::getStartedAt)
                .containsExactlyInAnyOrder(at(10, 2, 0, 0, 0), at(10, 2, 23, 59, 59));
        assertThat(logRepository.findMinStartedAt()).isEqualTo(at(10, 1, 23, 59, 59));

        assertThat(logRepository.deleteStartedBefore(at(10, 2, 0, 0, 0))).isEqualTo(1);
        assertThat(logRepository.count()).isEqualTo(3);
    }

    @Test
    @DisplayName("이력 조회는 최신순·필터·건수 제한을 지키고, 부서 '-' 는 부서 없는 행을 찾는다")
    void history() {
        logRepository.saveAll(List.of(
                log("userA", "D100", "p/a", "OPEN", at(10, 2, 9, 0, 0), 1_000),
                log("userA", null, "p/b", "OPEN", at(10, 2, 10, 0, 0), 1_000),
                log("userB", "D200", "p/a", "OPEN", at(10, 2, 11, 0, 0), 1_000)));
        LocalDateTime from = at(10, 2, 0, 0, 0);
        LocalDateTime to = at(10, 3, 0, 0, 0);

        assertThat(logRepository.findHistory(from, to, null, null, null, PageRequest.of(0, 10)))
                .extracting(ScreenUsageLog::getStartedAt)
                .containsExactly(at(10, 2, 11, 0, 0), at(10, 2, 10, 0, 0), at(10, 2, 9, 0, 0));
        assertThat(logRepository.findHistory(from, to, null, "-", null, PageRequest.of(0, 10)))
                .extracting(ScreenUsageLog::getPageId).containsExactly("p/b");
        assertThat(logRepository.findHistory(from, to, "userA", null, null, PageRequest.of(0, 10))).hasSize(2);
        assertThat(logRepository.findHistory(from, to, null, null, "p/a", PageRequest.of(0, 10))).hasSize(2);
        assertThat(logRepository.findHistory(from, to, null, null, null, PageRequest.of(0, 2))).hasSize(2);
    }

    @Test
    @DisplayName("일별 집계는 화면·사용자·부서 합계와 일자별 이용자 수를 GROUP BY 로 낸다")
    void daySums() {
        dayRepository.saveAll(List.of(
                day("20261001", "p1", "userA", "D100", 1, 2, 1_000),
                day("20261002", "p1", "userA", "D100", 2, 3, 2_000),
                day("20261002", "p1", "userB", "-", 1, 1, 500),
                day("20261002", "p2", "userA", "D100", 0, 1, 700)));

        assertThat(dayRepository.sumByPageUserDept("20261001", "20261002", null, null, null))
                .containsExactlyInAnyOrder(
                        new UsageSum("p1", "userA", "D100", 3L, 5L, 3_000L, "20261002"),
                        new UsageSum("p1", "userB", "-", 1L, 1L, 500L, "20261002"),
                        new UsageSum("p2", "userA", "D100", 0L, 1L, 700L, "20261002"));
        assertThat(dayRepository.sumByPageUserDept("20261001", "20261002", "-", null, null))
                .containsExactly(new UsageSum("p1", "userB", "-", 1L, 1L, 500L, "20261002"));
        assertThat(dayRepository.sumByPageUserDept("20261002", "20261002", null, "userA", "p1"))
                .containsExactly(new UsageSum("p1", "userA", "D100", 2L, 3L, 2_000L, "20261002"));
        assertThat(dayRepository.sumByDay("20261001", "20261002", null, null, null))
                .containsExactly(
                        new DailySum("20261001", 1L, 1L, 1_000L),
                        new DailySum("20261002", 3L, 2L, 3_200L));
        assertThat(dayRepository.findMaxUsageDt()).isEqualTo("20261002");
        assertThat(dayRepository.findLastUsedDtByPage())
                .containsExactlyInAnyOrder(new PageLastUsed("p1", "20261002"), new PageLastUsed("p2", "20261002"));

        assertThat(dayRepository.deleteByUsageDt("20261002")).isEqualTo(3);
        assertThat(dayRepository.findMaxUsageDt()).isEqualTo("20261001");
    }
}
