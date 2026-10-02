package com.dongkuk.dmes.cactus.mdm;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReference;

/**
 * MDM 메타 조회 입구(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.2·§5.4). 여러 키를 받아 캐시에 없는 키만 모아 MDM 에
 * 한 번 요청하고, 응답에 없는 키는 "없음"으로 캐시한다. 같은 키 동시 적재는 한 번만 한다(진행 중인 적재를 기다린다).
 *
 * <p>MDM 장애: 캐시에 있는 항목은 계속 답한다. 캐시에 없는 키는 {@code unavailable}({@link #one} 은 {@link MdmUnavailableException})이고
 * "없음"으로 캐시하지 않는다. 연속 {@value #SKIP_AFTER_FAILURES}번 실패하면 30초 동안 MDM 을 부르지 않고 바로 실패로 답한다(Ruling R6).
 * 실패 수와 건너뛰기 기한은 한 상태 값으로 함께 바꾼다 — 성공과 실패가 겹쳐도 "실패 0 인데 건너뛰기" 같은 어긋난 상태가 생기지 않는다.
 * MDM 이 정의를 만들지 못한 키(failed)도 unavailable 이지만 장애로 세지 않는다(Ruling R4).
 */
public class MdmMetaService {

    static final Duration SKIP_FOR = Duration.ofSeconds(30);
    static final int SKIP_AFTER_FAILURES = 2;
    /** 다른 요청의 진행 중 적재를 기다리는 한도 — 연결·읽기 시간 초과 합보다 길다. */
    static final Duration WAIT_LIMIT = Duration.ofSeconds(30);

    private final MdmMetaFeed feed;
    private final MdmMetaCache cache;
    private final Clock clock;
    private final ConcurrentHashMap<String, CompletableFuture<Optional<Object>>> inflight = new ConcurrentHashMap<>();
    private final AtomicReference<Health> health = new AtomicReference<>(Health.OK);

    public MdmMetaService(MdmMetaFeed feed, MdmMetaCache cache, Clock clock) {
        this.feed = feed;
        this.cache = cache;
        this.clock = clock;
    }

    /** 찾은 키의 값, MDM 에 없는 키, 지금 받을 수 없는 키. 요청 순서를 지킨다. */
    public record MdmLookup(Map<String, Object> found, List<String> missing, List<String> unavailable) {
    }

    /** 연속 실패 수와 건너뛰기 기한(null 이면 건너뛰지 않음) — 늘 함께 바뀐다. */
    private record Health(int failures, Instant skipUntil) {
        static final Health OK = new Health(0, null);
    }

    public MdmLookup lookup(MdmTargetType type, Collection<String> keys) {
        Map<String, Object> found = new LinkedHashMap<>();
        List<String> missing = new ArrayList<>();
        List<String> unavailable = new ArrayList<>();
        Map<String, CompletableFuture<Optional<Object>>> mine = new LinkedHashMap<>();
        Map<String, CompletableFuture<Optional<Object>>> waiting = new LinkedHashMap<>();
        for (String key : new LinkedHashSet<>(keys)) {
            if (key == null || key.isBlank()) {
                continue;
            }
            Optional<MdmMetaCache.Entry> hit = cache.get(type, key);
            if (hit.isPresent()) {
                if (hit.get().absent()) {
                    missing.add(key);
                } else {
                    found.put(key, hit.get().value());
                }
                continue;
            }
            CompletableFuture<Optional<Object>> f = new CompletableFuture<>();
            CompletableFuture<Optional<Object>> running = inflight.putIfAbsent(id(type, key), f);
            if (running == null) {
                mine.put(key, f);
            } else {
                waiting.put(key, running);
            }
        }
        if (!mine.isEmpty()) {
            load(type, mine);
        }
        Map<String, CompletableFuture<Optional<Object>>> all = new LinkedHashMap<>(mine);
        all.putAll(waiting);
        await(all, found, missing, unavailable);
        return new MdmLookup(found, missing, unavailable);
    }

    /** 키 하나. 없으면 빈 값, 받을 수 없으면 {@link MdmUnavailableException}. */
    public Optional<Object> one(MdmTargetType type, String key) {
        MdmLookup r = lookup(type, List.of(key));
        if (!r.unavailable().isEmpty()) {
            throw new MdmUnavailableException("MDM 정의를 받을 수 없습니다: " + type + " " + key);
        }
        return Optional.ofNullable(r.found().get(key));
    }

    /**
     * 이 인스턴스 캐시에서 지우고 다시 받는다(관리 화면 load). 진행 중인 적재에 합류하지 않는다 — 지움 기록을 남겨 그 전에 시작한 적재가 옛 값을
     * 넣지 못하게 하고, 자기 적재를 진행 중 자리에 앉혀 뒤이은 조회가 새 적재를 기다리게 한다.
     */
    public MdmLookup reload(MdmTargetType type, Collection<String> keys) {
        Map<String, CompletableFuture<Optional<Object>>> mine = new LinkedHashMap<>();
        for (String key : new LinkedHashSet<>(keys)) {
            if (key == null || key.isBlank()) {
                continue;
            }
            cache.evictLocal(type, key);
            CompletableFuture<Optional<Object>> f = new CompletableFuture<>();
            inflight.put(id(type, key), f); // 앞선 적재의 자리를 빼앗는다. 앞선 적재는 자기 것만 지우므로 이 자리를 건드리지 않는다
            mine.put(key, f);
        }
        Map<String, Object> found = new LinkedHashMap<>();
        List<String> missing = new ArrayList<>();
        List<String> unavailable = new ArrayList<>();
        if (!mine.isEmpty()) {
            load(type, mine);
        }
        await(mine, found, missing, unavailable);
        return new MdmLookup(found, missing, unavailable);
    }

    public int consecutiveFailures() {
        return health.get().failures();
    }

    private static void await(Map<String, CompletableFuture<Optional<Object>>> futures, Map<String, Object> found, List<String> missing,
                              List<String> unavailable) {
        futures.forEach((key, f) -> {
            try {
                Optional<Object> v = f.get(WAIT_LIMIT.toMillis(), TimeUnit.MILLISECONDS);
                if (v.isPresent()) {
                    found.put(key, v.get());
                } else {
                    missing.add(key);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                unavailable.add(key);
            } catch (ExecutionException | TimeoutException e) {
                unavailable.add(key);
            }
        });
    }

    private void load(MdmTargetType type, Map<String, CompletableFuture<Optional<Object>>> mine) {
        MdmMetaCache.Ticket ticket = cache.ticket();
        try {
            Instant until = health.get().skipUntil();
            if (until != null && clock.instant().isBefore(until)) {
                MdmUnavailableException skipped = new MdmUnavailableException("MDM 연속 실패로 " + until + " 까지 호출을 건너뜁니다");
                mine.values().forEach(f -> f.completeExceptionally(skipped));
                return;
            }
            MdmFetchResult result;
            try {
                result = feed.fetch(type, mine.keySet());
            } catch (RuntimeException e) {
                Instant now = clock.instant();
                health.updateAndGet(h -> {
                    int n = h.failures() + 1;
                    return new Health(n, n >= SKIP_AFTER_FAILURES ? now.plus(SKIP_FOR) : h.skipUntil());
                });
                mine.values().forEach(f -> f.completeExceptionally(e));
                return;
            }
            health.set(Health.OK);
            Map<String, Object> toCache = new LinkedHashMap<>();
            mine.keySet().forEach(key -> {
                if (!result.failed().containsKey(key)) {
                    toCache.put(key, result.found().get(key)); // null = "없음"
                }
            });
            cache.putAll(type, toCache, ticket);
            mine.forEach((key, f) -> {
                String failed = result.failed().get(key);
                if (failed != null || result.failed().containsKey(key)) {
                    f.completeExceptionally(new MdmUnavailableException(failed == null ? "MDM 이 정의를 만들지 못했습니다: " + key : failed));
                    return;
                }
                f.complete(Optional.ofNullable(result.found().get(key)));
            });
        } finally {
            mine.forEach((key, f) -> {
                f.completeExceptionally(new MdmUnavailableException("적재가 끝나지 않았습니다: " + key)); // 이미 끝났으면 무시된다
                inflight.remove(id(type, key), f);
            });
        }
    }

    private static String id(MdmTargetType type, String key) {
        return type.name() + ':' + key;
    }
}
