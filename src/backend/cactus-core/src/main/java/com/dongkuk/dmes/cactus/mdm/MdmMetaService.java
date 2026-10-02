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
import java.util.concurrent.atomic.AtomicInteger;

/**
 * MDM 메타 조회 입구(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.2·§5.4). 여러 키를 받아 캐시에 없는 키만 모아 MDM 에
 * 한 번 요청하고, 응답에 없는 키는 "없음"으로 캐시한다. 같은 키 동시 적재는 한 번만 한다(진행 중인 적재를 기다린다).
 *
 * <p>MDM 장애: 캐시에 있는 항목은 계속 답한다. 캐시에 없는 키는 {@code unavailable}({@link #one} 은 {@link MdmUnavailableException})이고
 * "없음"으로 캐시하지 않는다. 연속 {@value #SKIP_AFTER_FAILURES}번 실패하면 30초 동안 MDM 을 부르지 않고 바로 실패로 답한다(Ruling R6).
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
    private final AtomicInteger failures = new AtomicInteger();
    private volatile Instant skipUntil;

    public MdmMetaService(MdmMetaFeed feed, MdmMetaCache cache, Clock clock) {
        this.feed = feed;
        this.cache = cache;
        this.clock = clock;
    }

    /** 찾은 키의 값, MDM 에 없는 키, 지금 받을 수 없는 키. 요청 순서를 지킨다. */
    public record MdmLookup(Map<String, Object> found, List<String> missing, List<String> unavailable) {
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
        all.forEach((key, f) -> {
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

    /** 이 인스턴스 캐시에서 지우고 다시 받는다(관리 화면 load). */
    public MdmLookup reload(MdmTargetType type, Collection<String> keys) {
        for (String k : keys) {
            if (k != null) {
                cache.evictLocal(type, k);
            }
        }
        return lookup(type, keys);
    }

    public int consecutiveFailures() {
        return failures.get();
    }

    private void load(MdmTargetType type, Map<String, CompletableFuture<Optional<Object>>> mine) {
        MdmMetaCache.Ticket ticket = cache.ticket();
        try {
            Instant until = skipUntil;
            if (until != null && clock.instant().isBefore(until)) {
                MdmUnavailableException skipped = new MdmUnavailableException("MDM 연속 실패로 " + until + " 까지 호출을 건너뜁니다");
                mine.values().forEach(f -> f.completeExceptionally(skipped));
                return;
            }
            MdmFetchResult result;
            try {
                result = feed.fetch(type, mine.keySet());
            } catch (RuntimeException e) {
                if (failures.incrementAndGet() >= SKIP_AFTER_FAILURES) {
                    skipUntil = clock.instant().plus(SKIP_FOR);
                }
                mine.values().forEach(f -> f.completeExceptionally(e));
                return;
            }
            failures.set(0);
            skipUntil = null;
            mine.forEach((key, f) -> {
                String failed = result.failed().get(key);
                if (failed != null) {
                    f.completeExceptionally(new MdmUnavailableException(failed));
                    return;
                }
                Object value = result.found().get(key);
                cache.put(type, key, value, ticket);
                f.complete(Optional.ofNullable(value));
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
