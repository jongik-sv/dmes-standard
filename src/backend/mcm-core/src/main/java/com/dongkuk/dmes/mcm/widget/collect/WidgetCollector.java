package com.dongkuk.dmes.mcm.widget.collect;

import com.dongkuk.dmes.mcm.common.exception.BusinessException;
import com.dongkuk.dmes.mcm.widget.collect.entity.WidgetCollectRun;
import com.dongkuk.dmes.mcm.widget.def.entity.WidgetDef;
import com.dongkuk.dmes.mcm.widget.def.repository.WidgetDefRepository;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.temporal.ChronoUnit;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * 정시 수집기 — 스펙 2026-10-05 정시 수집 §4. 매분 0초에 사용 중인 {@code collect} 정의를 읽어 이번 분이 수집 시각인 정의만 수집하고,
 * 매일 03:30 에 90일 지난 값을 지운다(본보기 {@code ScreenUsageRollup}).
 * <ul>
 *   <li>수집 시각 {@code slot} = 틱이 시작한 분({@code yyyyMMddHHmm}, Asia/Seoul). 지나간 시각은 따라잡지 않는다.</li>
 *   <li>중복 방지: RUN 행을 먼저 넣고(PK 위반이면 다른 인스턴스·이전 시도가 잡은 시각이라 건너뜀) 수집한다. ShedLock 이 없어도 같은 정의·같은 분은 한 번만 돈다.</li>
 *   <li>틱이 시작한 지 45초가 지나면 새 정의를 시작하지 않고(건너뛴 수는 warn 로그) 다음 분 틱과 겹치지 않게 한다.</li>
 *   <li>한 틱에 최대 50개 정의를 정의 순서대로. 한 정의의 실패(설정 오류·원천 실패·DB 오류)는 다른 정의를 막지 않고, 예외는 삼키고 로그만 남긴다
 *       (주소·인증값·DB 메시지는 로그·RUN 행에 넣지 않는다).</li>
 *   <li>{@code dmes.widget.collect.enabled=false} 면 수집·삭제를 모두 하지 않는다.</li>
 *   <li>설정은 틱마다 다시 읽어 검사한다({@link CollectConfigs#parse}) — 저장 때 검사했어도 실행 때 다시 판정한다.</li>
 * </ul>
 */
@Component
public class WidgetCollector {

    private static final Logger log = LoggerFactory.getLogger(WidgetCollector.class);

    static final ZoneId ZONE = ZoneId.of("Asia/Seoul");
    static final DateTimeFormatter SLOT = DateTimeFormatter.ofPattern("yyyyMMddHHmm");
    static final int MAX_PER_TICK = 50;
    static final int RETENTION_DAYS = 90;
    /** 보관 삭제 한 덩어리의 행 수와 한 번의 삭제에서 지우는 덩어리 수 상한(끝없는 반복 방지). */
    static final int PURGE_CHUNK_ROWS = 5000;
    static final int PURGE_MAX_CHUNKS = 2000;
    /** 틱 시작 뒤 이 시간이 지나면 새 정의를 시작하지 않는다(다음 분 틱과 겹치지 않게). */
    static final Duration TICK_DEADLINE = Duration.ofSeconds(45);
    static final String MSG_NO_ITEMS = "수집된 값이 없습니다.";
    static final String MSG_UNEXPECTED = "수집 중 오류가 발생했습니다: ";

    private final WidgetDefRepository defRepository;
    private final WidgetCollectWriter writer;
    private final WidgetCollectProperties properties;
    private final SqlCollectSource sqlSource;
    private final HttpCollectSource httpSource;
    private final ExchangeCollectSource exchangeSource;
    private final Clock clock;

    @Autowired
    WidgetCollector(WidgetDefRepository defRepository, WidgetCollectWriter writer, WidgetCollectProperties properties,
                    SqlCollectSource sqlSource, HttpCollectSource httpSource, ExchangeCollectSource exchangeSource) {
        this(defRepository, writer, properties, sqlSource, httpSource, exchangeSource, Clock.system(ZONE));
    }

    WidgetCollector(WidgetDefRepository defRepository, WidgetCollectWriter writer, WidgetCollectProperties properties,
                    SqlCollectSource sqlSource, HttpCollectSource httpSource, ExchangeCollectSource exchangeSource, Clock clock) {
        this.defRepository = defRepository;
        this.writer = writer;
        this.properties = properties;
        this.sqlSource = sqlSource;
        this.httpSource = httpSource;
        this.exchangeSource = exchangeSource;
        this.clock = clock;
    }

    @Scheduled(cron = "0 * * * * *", zone = "Asia/Seoul")
    public void scheduledTick() {
        try {
            int started = tick();
            if (started > 0) log.info("WidgetCollector: {} 건 수집 시작", started);
        } catch (Exception e) {
            log.warn("WidgetCollector 틱 실패 (swallow) 원인={}", e.getClass().getSimpleName());
        }
    }

    @Scheduled(cron = "0 30 3 * * *", zone = "Asia/Seoul")
    public void scheduledPurge() {
        try {
            int purged = purge();
            if (purged > 0) log.info("WidgetCollector: 보관 기간 밖 {} 행 삭제", purged);
        } catch (Exception e) {
            log.warn("WidgetCollector 보관 삭제 실패 (swallow) 원인={}", e.getClass().getSimpleName());
        }
    }

    /**
     * 이번 분(시계 기준)이 수집 시각인 정의를 수집한다.
     *
     * @return 이번 틱에 수집을 시작한 정의 수(다른 인스턴스가 이미 잡은 정의·수집 시각이 아닌 정의는 세지 않는다)
     */
    public int tick() {
        if (!properties.isEnabled()) return 0;
        LocalDateTime minute = LocalDateTime.ofInstant(clock.instant(), ZONE).truncatedTo(ChronoUnit.MINUTES);
        String slot = SLOT.format(minute);
        List<WidgetDef> defs = defRepository.findBySrcTpAndTypeIdOrderByWidgetIdAsc(WidgetDef.SRC_DEF, CollectConfig.TYPE_ID);
        int started = 0;
        int skippedByDeadline = 0;
        Instant deadline = clock.instant().plus(TICK_DEADLINE);
        for (WidgetDef def : defs) {
            if (!def.isInUse()) continue;
            CollectConfig config;
            try {
                config = CollectConfigs.parse(def.getConfigJson());
            } catch (BusinessException e) {
                log.warn("정시 수집 설정 오류 defId={} 사유={}", def.getWidgetId(), e.getMessage());
                continue;
            }
            if (!config.schedule().isDue(minute)) continue;
            if (!clock.instant().isBefore(deadline)) {
                skippedByDeadline++; // 이미 시작이 늦었다 — 새 정의를 시작하지 않는다
                continue;
            }
            if (started >= MAX_PER_TICK) {
                log.warn("정시 수집 한 틱 상한({})을 넘어 나머지 정의는 이번 시각을 건너뜁니다 slot={}", MAX_PER_TICK, slot);
                break;
            }
            try {
                if (collectOne(def.getWidgetId(), config, slot, minute.toLocalDate())) started++;
            } catch (RuntimeException e) {
                log.warn("정시 수집 처리 실패 defId={} 원인={}", def.getWidgetId(), e.getClass().getSimpleName());
            }
        }
        if (skippedByDeadline > 0) {
            log.warn("정시 수집 틱이 {}초를 넘겨 {} 개 정의를 이번 시각({})에 건너뜁니다", TICK_DEADLINE.toSeconds(), skippedByDeadline, slot);
        }
        return started;
    }

    /** 보관 기간(90일, 오늘 0시 기준) 밖의 값·회차를 5천 행 안팎의 덩어리로 나눠 지운다. */
    public int purge() {
        if (!properties.isEnabled()) return 0;
        LocalDate today = LocalDateTime.ofInstant(clock.instant(), ZONE).toLocalDate();
        String cutoff = SLOT.format(today.minusDays(RETENTION_DAYS).atStartOfDay());
        int total = 0;
        for (int chunk = 0; chunk < PURGE_MAX_CHUNKS; chunk++) {
            int deleted = writer.purgeChunk(cutoff, PURGE_CHUNK_ROWS);
            if (deleted == 0) break;
            total += deleted;
        }
        return total;
    }

    /** @return 이 인스턴스가 이 시각을 잡아 수집했으면 true, 이미 잡혀 있어 건너뛰었으면 false */
    private boolean collectOne(String widgetId, CollectConfig config, String slot, LocalDate today) {
        try {
            if (!writer.tryStart(widgetId, slot, clock.instant())) return false;
        } catch (DataIntegrityViolationException e) {
            return false; // 동시에 다른 인스턴스가 먼저 넣었다
        }
        String status = WidgetCollectRun.STATUS_OK;
        String message = null;
        int count = 0;
        try {
            List<CollectItem> items = fetch(config.source(), today);
            if (items.isEmpty()) throw new CollectException(MSG_NO_ITEMS);
            for (CollectItem item : items) {
                try {
                    if (writer.insertItem(widgetId, slot, item)) count++;
                } catch (DataIntegrityViolationException e) {
                    // 같은 PK 의 값이 이미 있다 — 무시한다
                }
            }
        } catch (CollectException | BusinessException e) {
            status = WidgetCollectRun.STATUS_FAIL;
            message = e.getMessage();
        } catch (RuntimeException e) {
            status = WidgetCollectRun.STATUS_FAIL;
            message = MSG_UNEXPECTED + e.getClass().getSimpleName(); // 원인 메시지에 주소·DB 정보가 있을 수 있어 종류만 적는다
            log.warn("정시 수집 실패 defId={} 원인={}", widgetId, e.getClass().getSimpleName());
        }
        Instant ended = clock.instant();
        writer.finish(widgetId, slot, status, count, message, ended);
        return true;
    }

    private List<CollectItem> fetch(CollectConfig.Source source, LocalDate today) {
        return switch (source) {
            case CollectConfig.SqlSource s -> sqlSource.collect(s, today);
            case CollectConfig.HttpSource h -> httpSource.collect(h, today);
            case CollectConfig.ExchangeSource e -> exchangeSource.collect(e, today);
        };
    }
}
