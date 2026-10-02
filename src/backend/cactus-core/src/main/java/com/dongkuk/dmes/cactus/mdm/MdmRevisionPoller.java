package com.dongkuk.dmes.cactus.mdm;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.TreeSet;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/**
 * MDM 변경 기록 폴러(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.3) — {@code poll-interval} 마다
 * {@code changes(since)} 를 받아 키를 지운다. 규칙: ① 기동 — 첫 성공에서 latestSeq 를 appliedSeq 로 삼고 그 전 항목을 비운다
 * (첫 폴링이 실패하면 처음 성공할 때 같은 규칙) ② 정상 — 받은 키를 지우고 appliedSeq = 마지막 seq ③ truncated — 전부 비우고 appliedSeq = latestSeq
 * ④ 역행(latestSeq < appliedSeq) — 전부 비우고 appliedSeq = latestSeq ⑤ 경합 — {@link MdmMetaCache} 의 Ticket 이 막는다. RELOAD 는 지운 뒤
 * 바로 다시 적재한다. 폴링이 계속 실패해도 캐시를 비우지 않는다(§5.4).
 *
 * <p>순번 역전 대비 되돌아보기(계획 검토 A1): 운영 DB 에서는 낮은 순번이 높은 순번보다 늦게 커밋될 수 있다. 그래서
 * {@code since = max(0, appliedSeq - lookback)} 로 최근 {@code lookback} 개 순번을 다시 받고, 이미 처리한 순번은 건너뛰며 처음 보는
 * 순번(늦게 커밋된 낮은 순번 포함)만 적용한다. 처리한 순번은 구간({@code appliedSeq - lookback} 초과) 안에서만 기억한다. truncated 판정이
 * 되돌아보기 구간을 포함한 응답 기준이므로 {@code pageLimit > lookback} 이어야 한다(아니면 생성 때 예외). lookback 0 이면 끈다.
 *
 * <p>스케줄러는 자체 단일 데몬 스레드다(cactus-core 에 스케줄링 선례가 없고, mcm-core 의 {@code @EnableScheduling} 에 기대지 않는다).
 * 로그는 첫 실패만 WARN, 복구 때 INFO 한 줄(Ruling R12).
 */
public class MdmRevisionPoller implements AutoCloseable {

    private static final Logger log = LoggerFactory.getLogger(MdmRevisionPoller.class);
    static final String RELOAD = "RELOAD";
    /** {@code cactus.mdm.revision-lookback} 기본값. */
    public static final int DEFAULT_LOOKBACK = 100;

    private final MdmMetaFeed feed;
    private final MdmMetaCache cache;
    private final MdmMetaService service;
    private final Clock clock;
    private final Duration interval;
    private final int pageLimit;
    private final int lookback;
    /** 되돌아보기 구간 안에서 이미 적용한 순번. {@link #pollOnce} 의 잠금 안에서만 만진다. */
    private final TreeSet<Long> processed = new TreeSet<>();
    private final AtomicInteger consecutiveFailures = new AtomicInteger();
    private volatile long latestSeq = -1L;
    private volatile Instant lastSuccessAt;
    private volatile String lastError;
    private ScheduledExecutorService executor;

    /** 되돌아보기 기본값({@value #DEFAULT_LOOKBACK})으로 만든다. */
    public MdmRevisionPoller(MdmMetaFeed feed, MdmMetaCache cache, MdmMetaService service, Clock clock, Duration interval, int pageLimit) {
        this(feed, cache, service, clock, interval, pageLimit, DEFAULT_LOOKBACK);
    }

    /** @throws IllegalArgumentException {@code lookback < 0} 이거나, 켰는데 {@code pageLimit <= lookback} 이면(기동 시 설정 검증) */
    public MdmRevisionPoller(MdmMetaFeed feed, MdmMetaCache cache, MdmMetaService service, Clock clock, Duration interval, int pageLimit,
                             int lookback) {
        this.feed = feed;
        this.cache = cache;
        this.service = service;
        this.clock = clock;
        this.interval = interval;
        this.pageLimit = Math.max(1, pageLimit);
        if (lookback < 0) {
            throw new IllegalArgumentException("cactus.mdm.revision-lookback 은 0 이상이어야 합니다: " + lookback);
        }
        if (lookback > 0 && this.pageLimit <= lookback) {
            throw new IllegalArgumentException("cactus.mdm.page-limit(" + this.pageLimit + ") 은 cactus.mdm.revision-lookback(" + lookback
                    + ") 보다 커야 합니다 — 되돌아보기 구간이 한 번에 받을 수를 채워 늘 truncated 가 된다");
        }
        this.lookback = lookback;
    }

    public record Status(long appliedSeq, long latestSeq, Instant lastSuccessAt, int consecutiveFailures, String lastError) {
    }

    public Status status() {
        return new Status(cache.appliedSeq(), latestSeq, lastSuccessAt, consecutiveFailures.get(), lastError);
    }

    public synchronized void start() {
        if (executor != null) {
            return;
        }
        executor = Executors.newSingleThreadScheduledExecutor(r -> {
            Thread t = new Thread(r, "mdm-revision-poller");
            t.setDaemon(true);
            return t;
        });
        executor.scheduleWithFixedDelay(this::pollQuietly, 0L, interval.toMillis(), TimeUnit.MILLISECONDS);
    }

    @Override
    public synchronized void close() {
        if (executor != null) {
            executor.shutdownNow();
            executor = null;
        }
    }

    /** 한 번 확인한다. 예외를 던지지 않는다 — 실패는 상태에 남긴다. */
    public synchronized void pollOnce() {
        try {
            long applied = cache.appliedSeq();
            if (applied < 0) {
                MdmChanges first = feed.changes(0L, 1);
                latestSeq = first.latestSeq();
                clearAll(first.latestSeq());
                succeeded();
                return;
            }
            MdmChanges c = feed.changes(Math.max(0L, applied - lookback), pageLimit);
            latestSeq = c.latestSeq();
            if (c.truncated() || c.latestSeq() < applied) {
                log.info("[mdm] 캐시를 비운다 — {} (applied {}, latest {})", c.truncated() ? "변경이 한 번에 받을 수를 넘었다" : "순번 역행",
                        applied, c.latestSeq());
                clearAll(c.latestSeq());
                succeeded();
                return;
            }
            long last = applied;
            Map<MdmTargetType, Set<String>> reload = new EnumMap<>(MdmTargetType.class);
            List<MdmChange> items = c.items().stream().sorted(Comparator.comparingLong(MdmChange::seq)).toList();
            for (MdmChange ch : items) {
                last = Math.max(last, ch.seq());
                if (lookback > 0 && !processed.add(ch.seq())) {
                    continue; // 되돌아보기로 다시 받은, 이미 적용한 순번
                }
                Optional<MdmTargetType> type = MdmTargetType.parse(ch.type());
                if (type.isEmpty() || ch.key() == null) {
                    log.debug("[mdm] 모르는 변경 기록을 건너뛴다: {}", ch);
                    continue;
                }
                // 늦게 커밋된 낮은 순번이 그 키의 지움 기록을 낮추지 않게 이미 적용한 순번 아래로 내리지 않는다(R7 경합 보호 유지).
                cache.evict(type.get(), ch.key(), Math.max(ch.seq(), applied));
                if (RELOAD.equals(ch.kind())) {
                    reload.computeIfAbsent(type.get(), t -> new LinkedHashSet<>()).add(ch.key());
                }
            }
            cache.markApplied(last);
            if (lookback > 0) {
                processed.headSet(last - lookback, true).clear(); // 구간 밖으로 밀려난 순번은 다시 오지 않는다
            }
            succeeded();
            reload.forEach(service::lookup); // 받을 수 없는 키는 unavailable 로 돌아오고 캐시에 남지 않는다
        } catch (RuntimeException e) {
            lastError = e.getMessage();
            if (consecutiveFailures.incrementAndGet() == 1) {
                log.warn("[mdm] 변경 기록 확인 실패 — 캐시는 그대로 쓴다: {}", e.getMessage());
            } else {
                log.debug("[mdm] 변경 기록 확인 실패 {}회째: {}", consecutiveFailures.get(), e.getMessage());
            }
        }
    }

    /** 시험용 — 기억하고 있는 처리한 순번 수. */
    synchronized int processedSeqCount() {
        return processed.size();
    }

    private void clearAll(long newAppliedSeq) {
        cache.clear(newAppliedSeq);
        processed.clear();
    }

    private void pollQuietly() {
        try {
            pollOnce();
        } catch (Throwable t) {
            log.error("[mdm] 폴러 오류", t);
        }
    }

    private void succeeded() {
        if (consecutiveFailures.getAndSet(0) > 0) {
            log.info("[mdm] 변경 기록 확인 복구 (applied {})", cache.appliedSeq());
        }
        lastSuccessAt = clock.instant();
        lastError = null;
    }
}
