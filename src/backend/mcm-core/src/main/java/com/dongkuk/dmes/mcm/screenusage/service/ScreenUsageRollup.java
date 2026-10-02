package com.dongkuk.dmes.mcm.screenusage.service;

import com.dongkuk.dmes.mcm.screenusage.entity.ScreenUsageLog;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageDayRepository;
import com.dongkuk.dmes.mcm.screenusage.repository.ScreenUsageLogRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Clock;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.util.List;

/**
 * 화면 사용 일별 집계·보관 스케줄러 (설계 4.4). 매일 02:00 Asia/Seoul.
 *
 * <ol>
 *   <li>범위: 집계 테이블 최대 USAGE_DT 의 2일 전 ~ 어제 (집계가 비면 원본 최소 일자부터). 늦게 도착한 구간 반영용.</li>
 *   <li>일자마다 원본을 읽어 Java 에서 키별 합산 → 그 일자 삭제 → 삽입 ({@link ScreenUsageDayWriter}). 일자 단위 멱등이라
 *       서버 여러 대가 돌아도 결과가 같다(ShedLock 없음).</li>
 *   <li>집계가 끝난 뒤 STARTED_AT &lt; 오늘-365일 0시 원본 삭제. 위 루프가 어제까지 모두 집계했으므로 삭제 대상 일자는
 *       전부 집계된 일자다. 루프가 실패하면 예외로 빠져 삭제하지 않는다.</li>
 * </ol>
 * 날짜 계산은 Java 에서 하고 SQL 에는 범위 파라미터만 넘긴다.
 */
@Component
public class ScreenUsageRollup {

    private static final Logger log = LoggerFactory.getLogger(ScreenUsageRollup.class);

    static final int RECALC_DAYS = 2;
    static final int RETENTION_DAYS = 365;

    private final ScreenUsageLogRepository logRepository;
    private final ScreenUsageDayRepository dayRepository;
    private final ScreenUsageDayWriter dayWriter;
    private final Clock clock;

    @Autowired
    public ScreenUsageRollup(ScreenUsageLogRepository logRepository,
                             ScreenUsageDayRepository dayRepository,
                             ScreenUsageDayWriter dayWriter) {
        this(logRepository, dayRepository, dayWriter, Clock.system(ScreenUsageDates.ZONE));
    }

    ScreenUsageRollup(ScreenUsageLogRepository logRepository,
                      ScreenUsageDayRepository dayRepository,
                      ScreenUsageDayWriter dayWriter,
                      Clock clock) {
        this.logRepository = logRepository;
        this.dayRepository = dayRepository;
        this.dayWriter = dayWriter;
        this.clock = clock;
    }

    @Scheduled(cron = "0 0 2 * * *", zone = "Asia/Seoul")
    public void scheduledRollup() {
        try {
            Result result = rollup();
            log.info("ScreenUsageRollup: {} 일 집계, 원본 {} 건 보관 삭제", result.days(), result.purged());
        } catch (Exception e) {
            log.warn("ScreenUsageRollup 실패 (swallow): {}", e.getMessage());
        }
    }

    public Result rollup() {
        LocalDate today = LocalDate.now(clock);
        LocalDate yesterday = today.minusDays(1);
        LocalDate from = startDate();
        if (from == null) {
            return new Result(0, 0);
        }

        int days = 0;
        for (LocalDate d = from; !d.isAfter(yesterday); d = d.plusDays(1)) {
            List<ScreenUsageLog> logs = logRepository.findStartedBetween(d.atStartOfDay(), d.plusDays(1).atStartOfDay());
            dayWriter.replaceDay(ScreenUsageDates.format(d), ScreenUsageAggregator.sumByDayKey(logs));
            days++;
        }

        // 집계 완료 구간 = 어제까지. 보관 기준(오늘-365일)은 늘 그보다 앞이므로 집계된 일자만 지운다.
        LocalDate purgeBefore = today.minusDays(RETENTION_DAYS);
        if (purgeBefore.isAfter(yesterday.plusDays(1))) {
            purgeBefore = yesterday.plusDays(1);
        }
        int purged = logRepository.deleteStartedBefore(purgeBefore.atStartOfDay());
        return new Result(days, purged);
    }

    private LocalDate startDate() {
        String maxDt = dayRepository.findMaxUsageDt();
        if (maxDt != null) {
            return ScreenUsageDates.parseDt(maxDt).minusDays(RECALC_DAYS);
        }
        LocalDateTime min = logRepository.findMinStartedAt();
        return min == null ? null : min.toLocalDate();
    }

    public record Result(int days, int purged) {}
}
