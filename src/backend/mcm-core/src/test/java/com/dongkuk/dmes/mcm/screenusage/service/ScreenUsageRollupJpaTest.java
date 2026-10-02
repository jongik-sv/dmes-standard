package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDay;
import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageDayId;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import com.dongkuk.dmes.mcm.screenusage.support.ScreenUsageJpaTestConfig;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.test.context.junit.jupiter.SpringJUnitConfig;

import java.time.Clock;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.List;

import static com.dongkuk.dmes.mcm.screenusage.support.UsageFixtures.log;
import static org.assertj.core.api.Assertions.assertThat;

/** 집계 멱등성·자정 걸침·늦게 도착한 구간·보관 삭제 경계 (Review Focus 4). */
@SpringJUnitConfig(ScreenUsageJpaTestConfig.class)
class ScreenUsageRollupJpaTest {

    private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
    private static final String PAGE = "csa/commUserMng";

    @Autowired ScreenUsageLogRepository logRepository;
    @Autowired ScreenUsageDayRepository dayRepository;
    @Autowired ScreenUsageDayWriter dayWriter;

    @BeforeEach
    void clean() {
        logRepository.deleteAllInBatch();
        dayRepository.deleteAllInBatch();
    }

    private ScreenUsageRollup rollupAt(LocalDateTime seoulTime) {
        return new ScreenUsageRollup(logRepository, dayRepository, dayWriter,
                Clock.fixed(seoulTime.atZone(SEOUL).toInstant(), SEOUL));
    }

    private ScreenUsageDay dayRow(String usageDt, String userId, String deptCd) {
        return dayRepository.findById(new ScreenUsageDayId(usageDt, PAGE, userId, deptCd)).orElse(null);
    }

    private List<String> snapshot() {
        return dayRepository.findAll().stream()
                .map(d -> String.join("|", d.getUsageDt(), d.getPageId(), d.getUserId(), d.getDeptCd(),
                        String.valueOf(d.getOpenCnt()), String.valueOf(d.getSegCnt()), String.valueOf(d.getDurationMs())))
                .sorted()
                .toList();
    }

    @Test
    @DisplayName("같은 시각에 두 번 돌려도 집계 결과가 같다 (일자 단위 delete+insert 멱등)")
    void idempotent() {
        logRepository.saveAll(List.of(
                log("userA", "D100", PAGE, "OPEN", LocalDateTime.of(2026, 10, 1, 10, 0), 60_000),
                log("userA", "D100", PAGE, "SWITCH", LocalDateTime.of(2026, 10, 2, 10, 0), 30_000),
                log("userB", "D200", PAGE, "OPEN", LocalDateTime.of(2026, 10, 2, 11, 0), 10_000)));
        ScreenUsageRollup rollup = rollupAt(LocalDateTime.of(2026, 10, 3, 2, 0));

        ScreenUsageRollup.Result first = rollup.rollup();
        List<String> afterFirst = snapshot();
        rollup.rollup();

        assertThat(first.days()).isEqualTo(2); // 원본 최소 일자(10-01) ~ 어제(10-02)
        assertThat(afterFirst).hasSize(3);
        assertThat(snapshot()).isEqualTo(afterFirst);
    }

    @Test
    @DisplayName("자정을 걸친 구간은 시작 일자에 전부 귀속하고, 오늘 구간은 집계하지 않는다")
    void midnightCrossing() {
        logRepository.saveAll(List.of(
                log("userA", "D100", PAGE, "OPEN", LocalDateTime.of(2026, 10, 1, 23, 50), 1_200_000),
                log("userA", "D100", PAGE, "OPEN", LocalDateTime.of(2026, 10, 3, 1, 0), 5_000)));

        rollupAt(LocalDateTime.of(2026, 10, 3, 2, 0)).rollup();

        ScreenUsageDay oct1 = dayRow("20261001", "userA", "D100");
        assertThat(oct1.getDurationMs()).isEqualTo(1_200_000L);
        assertThat(oct1.getOpenCnt()).isEqualTo(1);
        assertThat(dayRow("20261002", "userA", "D100")).isNull();
        assertThat(dayRow("20261003", "userA", "D100")).isNull();
    }

    @Test
    @DisplayName("집계 뒤 도착한 전날 구간은 다음 집계(최대 일자-2일 재계산)에 반영되고, 창 밖 지연분은 반영되지 않는다")
    void lateArrival() {
        logRepository.saveAll(List.of(
                log("userA", "D100", PAGE, "OPEN", LocalDateTime.of(2026, 10, 1, 10, 0), 1_000),
                log("userA", "D100", PAGE, "OPEN", LocalDateTime.of(2026, 10, 2, 10, 0), 1_000)));
        rollupAt(LocalDateTime.of(2026, 10, 3, 2, 0)).rollup();
        assertThat(dayRepository.findMaxUsageDt()).isEqualTo("20261002");
        assertThat(dayRow("20261001", "userA", "D100").getOpenCnt()).isEqualTo(1);

        // 큐 재전송으로 10-03 낮에 늦게 도착: 10-01 구간(창 안), 09-29 구간(창 밖)
        logRepository.saveAll(List.of(
                log("userA", "D100", PAGE, "OPEN", LocalDateTime.of(2026, 10, 1, 11, 0), 2_000),
                log("userA", "D100", PAGE, "OPEN", LocalDateTime.of(2026, 9, 29, 11, 0), 2_000)));
        rollupAt(LocalDateTime.of(2026, 10, 4, 2, 0)).rollup(); // 재계산 09-30 ~ 10-03

        ScreenUsageDay oct1 = dayRow("20261001", "userA", "D100");
        assertThat(oct1.getOpenCnt()).isEqualTo(2);
        assertThat(oct1.getDurationMs()).isEqualTo(3_000L);
        assertThat(dayRow("20260929", "userA", "D100")).isNull();
    }

    @Test
    @DisplayName("365일 지난 원본만 지우고(오늘-365일 0시 미만), 지운 일자는 먼저 집계돼 있다")
    void retentionBoundary() {
        logRepository.saveAll(List.of(
                log("userA", "D100", PAGE, "OPEN", LocalDateTime.of(2025, 10, 2, 23, 59, 59), 1_000),
                log("userA", "D100", PAGE, "OPEN", LocalDateTime.of(2025, 10, 3, 0, 0, 0), 1_000)));

        ScreenUsageRollup.Result result = rollupAt(LocalDateTime.of(2026, 10, 3, 2, 0)).rollup();

        assertThat(result.purged()).isEqualTo(1);
        assertThat(logRepository.findAll()).extracting(l -> l.getStartedAt())
                .containsExactly(LocalDateTime.of(2025, 10, 3, 0, 0, 0));
        // 보관 기간(오늘-365일) 밖 일자는 집계하지 않는다 — 롤업 하한이 오늘-365일이다.
        assertThat(dayRow("20251002", "userA", "D100")).isNull();
        assertThat(dayRow("20251003", "userA", "D100").getOpenCnt()).isEqualTo(1);
    }

    @Test
    @DisplayName("집계가 비어 있고 원본에 400일 전 행이 있어도 보관 기간 밖 일자는 집계하지 않는다")
    void rollupLowerBound() {
        LocalDateTime old = LocalDateTime.of(2026, 10, 3, 10, 0).minusDays(400);
        logRepository.saveAll(List.of(
                log("userA", "D100", PAGE, "OPEN", old, 1_000),
                log("userA", "D100", PAGE, "OPEN", LocalDateTime.of(2026, 10, 2, 10, 0), 1_000)));

        ScreenUsageRollup.Result result = rollupAt(LocalDateTime.of(2026, 10, 3, 2, 0)).rollup();

        assertThat(result.days()).isEqualTo(365); // 오늘-365일 ~ 어제
        assertThat(dayRow(old.toLocalDate().format(java.time.format.DateTimeFormatter.BASIC_ISO_DATE), "userA", "D100")).isNull();
        assertThat(dayRow("20261002", "userA", "D100").getOpenCnt()).isEqualTo(1);
        assertThat(dayRepository.findAll()).hasSize(1);
    }

    @Test
    @DisplayName("원본도 집계도 없으면 아무것도 하지 않는다")
    void empty() {
        ScreenUsageRollup.Result result = rollupAt(LocalDateTime.of(2026, 10, 3, 2, 0)).rollup();

        assertThat(result.days()).isZero();
        assertThat(result.purged()).isZero();
    }
}
