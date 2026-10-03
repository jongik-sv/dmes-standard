package com.dongkuk.dmes.cactus.mdm;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.util.ArrayList;
import java.util.Collection;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.CompletableFuture;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.ExecutionException;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.TimeoutException;
import java.util.concurrent.atomic.AtomicReference;
import kr.dongkuk.maru.mdm.engine.code.CodeVersionSlice;
import kr.dongkuk.maru.mdm.engine.spi.CodeLookup.CodeRows;

/**
 * MDM 메타 조회 입구(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.2·§5.4). 여러 키를 받아 캐시에 없는 키만 모아 MDM 에
 * 한 번 요청하고, 응답에 없는 키는 "없음"으로 캐시한다. 같은 키 동시 적재는 한 번만 한다(진행 중인 적재를 기다린다).
 *
 * <p>MDM 장애: 캐시에 있는 항목은 계속 답한다. 캐시에 없는 키는 {@code unavailable}({@link #one} 은 {@link MdmUnavailableException})이고
 * "없음"으로 캐시하지 않는다. 연속 {@value #SKIP_AFTER_FAILURES}번 실패하면 30초 동안 MDM 을 부르지 않고 바로 실패로 답한다(Ruling R6).
 * 실패 수와 건너뛰기 기한은 한 상태 값으로 함께 바꾼다 — 성공과 실패가 겹쳐도 "실패 0 인데 건너뛰기" 같은 어긋난 상태가 생기지 않는다.
 * MDM 이 정의를 만들지 못한 키(failed)도 unavailable 이지만 장애로 세지 않는다(Ruling R4).
 *
 * <p>D-154 — 버전 대상(룰·룰 세트·코드·전문)은 {@link #lookupAt} 등 버전 입구로 받는다. {@code versioned} 가 거짓이면(versioned-feed: off) 지금처럼
 * 전 이력 한 키로 캐시하고 결과만 같은 모양으로 준다.
 */
public class MdmMetaService {

    static final Duration SKIP_FOR = Duration.ofSeconds(30);
    static final int SKIP_AFTER_FAILURES = 2;
    /** 다른 요청의 진행 중 적재를 기다리는 한도 — 연결·읽기 시간 초과 합보다 길다. */
    static final Duration WAIT_LIMIT = Duration.ofSeconds(30);
    /** 본문 요청 failed 메시지 — 목차가 낡았다(§5.6 가). */
    static final String NOT_RELEASED = "NOT_RELEASED";

    private final MdmMetaFeed feed;
    private final MdmMetaCache cache;
    private final Clock clock;
    private final ConcurrentHashMap<String, CompletableFuture<Optional<Object>>> inflight = new ConcurrentHashMap<>();
    private final AtomicReference<Health> health = new AtomicReference<>(Health.OK);

    private final boolean versioned;
    private final ConcurrentHashMap<String, CompletableFuture<Optional<MdmToc>>> inflightToc = new ConcurrentHashMap<>();
    /** 본문 적재 합류 — 키에 ver 가 들어간다(같은 코드의 두 버전이 합쳐지지 않게). 빈 값 = NOT_RELEASED. */
    private final ConcurrentHashMap<String, CompletableFuture<Optional<Object>>> inflightBody = new ConcurrentHashMap<>();

    /** 지금 동작(versioned-feed: off) — 버전 대상도 전 이력 한 키로 캐시한다. */
    public MdmMetaService(MdmMetaFeed feed, MdmMetaCache cache, Clock clock) {
        this(feed, cache, clock, false);
    }

    /** @param versioned 참이면 버전 대상을 목차·본문으로 적재한다(D-154). 거짓이면 전 이력 한 키(versioned-feed: off) */
    public MdmMetaService(MdmMetaFeed feed, MdmMetaCache cache, Clock clock, boolean versioned) {
        this.feed = feed;
        this.cache = cache;
        this.clock = clock;
        this.versioned = versioned;
    }

    /** 찾은 키의 값, MDM 에 없는 키, 지금 받을 수 없는 키. 요청 순서를 지킨다. */
    public record MdmLookup(Map<String, Object> found, List<String> missing, List<String> unavailable) {
    }

    /** 연속 실패 수와 건너뛰기 기한(null 이면 건너뛰지 않음) — 늘 함께 바뀐다. */
    private record Health(int failures, Instant skipUntil) {
        static final Health OK = new Health(0, null);
    }

    /** 판정 시각 t 의 버전 하나. {@code ver}·{@code body} 가 null 이면 "적용 버전 없음"(룰·세트·전문 — "없음"과 다르다). */
    public record MdmAt(MdmToc toc, String ver, Object body) {
    }

    /** 찾은 키의 결과, MDM 에 없는 키, 지금 받을 수 없는 키. 요청 순서를 지킨다. */
    public record MdmAtLookup(Map<String, MdmAt> found, List<String> missing, List<String> unavailable) {
    }

    /** 캐시만 읽은 결과 — {@code cached} 가 거짓이면 캐시에 없음, 참이면 {@code value}(null = MDM 에 없음으로 캐시됨). */
    public record CachedRead(boolean cached, Object value) {
    }

    private record Tocs(Map<String, MdmToc> tocs, Set<String> unavailable, Map<String, MdmCurrent> current) {
    }

    private record Bodies(Map<MdmBodyKey, Object> found, Set<MdmBodyKey> unavailable, Set<MdmBodyKey> notReleased) {
    }

    public boolean versioned() {
        return versioned;
    }

    public Instant now() {
        return clock.instant();
    }

    public MdmLookup lookup(MdmTargetType type, Collection<String> keys) {
        guardValue(type);
        return lookupValue(type, keys);
    }

    private MdmLookup lookupValue(MdmTargetType type, Collection<String> keys) {
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
        guardValue(type);
        return oneValue(type, key);
    }

    private Optional<Object> oneValue(MdmTargetType type, String key) {
        MdmLookup r = lookupValue(type, List.of(key));
        if (!r.unavailable().isEmpty()) {
            throw new MdmUnavailableException("MDM 정의를 받을 수 없습니다: " + type + " " + key);
        }
        return Optional.ofNullable(r.found().get(key));
    }

    /**
     * 캐시만 읽는다 — MDM 을 부르지 않고 진행 중인 적재도 기다리지 않는다(하위 프로젝트 C spec §6.2-4, {@link MdmCachedDefinitions}). 캐시에
     * 없으면(만료 포함) 빈 값, "없음"으로 캐시된 키는 {@code absent()} 인 항목이다.
     */
    public Optional<MdmMetaCache.Entry> cached(MdmTargetType type, String key) {
        guardValue(type);
        if (key == null || key.isBlank()) {
            return Optional.empty();
        }
        return cache.get(type, key);
    }

    /**
     * 이 인스턴스 캐시에서 지우고 다시 받는다(관리 화면 load). 진행 중인 적재에 합류하지 않는다 — 지움 기록을 남겨 그 전에 시작한 적재가 옛 값을
     * 넣지 못하게 하고, 자기 적재를 진행 중 자리에 앉혀 뒤이은 조회가 새 적재를 기다리게 한다.
     */
    public MdmLookup reload(MdmTargetType type, Collection<String> keys) {
        guardValue(type);
        return reloadValue(type, keys);
    }

    private MdmLookup reloadValue(MdmTargetType type, Collection<String> keys) {
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
            if (skipping(mine.values())) {
                return;
            }
            MdmFetchResult result;
            try {
                result = feed.fetch(type, mine.keySet());
            } catch (RuntimeException e) {
                failed(e, mine.values());
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

    // ------------------------------------------------------------------ 버전 입구

    /**
     * 판정 시각 t 의 정의(스펙 §5.2). ① 목차를 캐시에서 찾고 없는 키는 묶어 {@code TOC(at=t)} 한 번 ② 목차로 버전을 고른다 ③ 그 본문을 캐시에서
     * 찾고, 목차 응답의 current 가 같은 버전이면 그것을, 아니면 묶어 {@code BODY} 한 번. 본문이 {@code NOT_RELEASED} 면 그 묶음을 지우고 목차부터
     * 한 번만 다시 받는다(§5.6 가) — 두 번째에도 어긋나면 받을 수 없음이다.
     */
    public MdmAtLookup lookupAt(MdmTargetType type, Collection<String> keys, Instant t) {
        requireVersionedType(type);
        LocalDateTime at = kst(t);
        List<String> wanted = distinct(keys);
        return versioned ? lookupAtVersioned(type, wanted, at, true, true) : legacyAt(type, wanted, at);
    }

    /** 키 하나. 없으면 빈 값, 받을 수 없으면 {@link MdmUnavailableException}. */
    public Optional<MdmAt> oneAt(MdmTargetType type, String key, Instant t) {
        MdmAtLookup r = lookupAt(type, List.of(key), t);
        if (!r.unavailable().isEmpty()) {
            throw new MdmUnavailableException("MDM 정의를 받을 수 없습니다: " + type + " " + key);
        }
        return Optional.ofNullable(r.found().get(key));
    }

    /** 목차 하나(엔진 {@code CodeLookup.code}). 없으면 빈 값, 받을 수 없으면 {@link MdmUnavailableException}. */
    public Optional<MdmToc> toc(MdmTargetType type, String key) {
        requireVersionedType(type);
        if (!versioned) {
            return oneValue(type, key).map(full -> legacyToc(type, key, full));
        }
        Tocs s = tocs(type, List.of(key), kst(clock.instant()), true);
        if (s.unavailable().contains(key)) {
            throw new MdmUnavailableException("MDM 목차를 받을 수 없습니다: " + type + " " + key);
        }
        return Optional.ofNullable(s.tocs().get(key));
    }

    /**
     * 버전 본문 하나(엔진 {@code codeAt}·{@code CodeEffLookup}). 정의가 없으면(목차 없음) 빈 값. 받을 수 없으면 {@link MdmUnavailableException} —
     * 다른 버전으로 대신하지 않는다(§5.9). 목차에 없는 버전(엔진이 옛 목차로 고른 뒤 확정 취소된 경합 등, §5.6 다)도 빈 값이 아니라 받을 수 없음이다 —
     * 빈 값이면 해석기가 소속을 빈 집합으로 내려 옛 판정도 새 판정도 아닌 값이 된다. off 면 CODE 는 전 이력을 {@link MdmCodeVersion#full} 로
     * 감싼다(자르지 않는다).
     */
    public Optional<Object> body(MdmTargetType type, String key, String ver) {
        requireVersionedType(type);
        if (!versioned) {
            return oneValue(type, key).flatMap(full -> {
                try {
                    return legacyBody(type, full, ver);
                } catch (RuntimeException e) {
                    throw unreadable(type, key, e);
                }
            });
        }
        for (int attempt = 0; attempt < 2; attempt++) {
            Optional<MdmToc> toc = toc(type, key);
            if (toc.isEmpty()) {
                return Optional.empty();
            }
            if (toc.get().version(ver).isEmpty()) {
                throw new MdmUnavailableException("목차에 없는 버전입니다(확정 취소 경합 등): " + type + " " + MdmVersions.logical(key, ver));
            }
            MdmBodyKey bk = new MdmBodyKey(key, ver);
            Bodies b = bodies(type, Map.of(bk, toc.get()), Map.of(), true);
            if (b.found().containsKey(bk)) {
                return Optional.of(b.found().get(bk));
            }
            if (b.unavailable().contains(bk)) {
                throw new MdmUnavailableException("MDM 본문을 받을 수 없습니다: " + type + " " + MdmVersions.logical(key, ver));
            }
            cache.evictLocal(type, key); // NOT_RELEASED — 목차가 낡았다
        }
        throw new MdmUnavailableException("목차와 본문이 두 번 어긋났습니다: " + type + " " + MdmVersions.logical(key, ver));
    }

    /** 캐시만 읽는 목차(평가 중 — MDM 을 부르지 않는다). off 면 전 이력에서 만든다. */
    public CachedRead cachedToc(MdmTargetType type, String key) {
        requireVersionedType(type);
        if (key == null || key.isBlank()) {
            return new CachedRead(false, null);
        }
        Optional<MdmMetaCache.Entry> hit = cache.get(type, key);
        if (hit.isEmpty()) {
            return new CachedRead(false, null);
        }
        Object v = hit.get().value();
        return new CachedRead(true, !versioned && v != null ? legacyToc(type, key, v) : v);
    }

    /** 캐시만 읽는 본문. off 면 전 이력에서 고른다(CODE 는 full). */
    public CachedRead cachedBody(MdmTargetType type, String key, String ver) {
        requireVersionedType(type);
        if (key == null || key.isBlank()) {
            return new CachedRead(false, null);
        }
        if (!versioned) {
            Optional<MdmMetaCache.Entry> hit = cache.get(type, key);
            if (hit.isEmpty()) {
                return new CachedRead(false, null);
            }
            Object full = hit.get().value();
            if (full == null) {
                return new CachedRead(true, null);
            }
            try {
                return new CachedRead(true, legacyBody(type, full, ver).orElse(null));
            } catch (RuntimeException e) {
                throw unreadable(type, key, e); // 손상 값(소수 넷째 자리 ver 등) — body·legacyMdmAt 과 같다
            }
        }
        return cache.getBody(type, key, ver).map(e -> new CachedRead(true, e.value())).orElse(new CachedRead(false, null));
    }

    /**
     * 이 인스턴스에서 지우고 다시 받는다(관리 화면 load, 스펙 §7.1). 정의 키 {@code X} 는 묶음째 지우고 목차와 t 시각 본문을, 본문 키 {@code X@ver} 는
     * 그 본문만 지우고 다시 받는다. 진행 중 적재에 합류하지 않는다. found 의 키는 요청한 논리 키다.
     */
    public MdmAtLookup reloadAt(MdmTargetType type, Collection<String> logicalKeys, Instant t) {
        requireVersionedType(type);
        LocalDateTime at = kst(t);
        List<String> defKeys = new ArrayList<>();
        Map<String, MdmVersions.LogicalKey> bodyKeys = new LinkedHashMap<>();
        for (String l : distinct(logicalKeys)) {
            MdmVersions.LogicalKey lk = MdmVersions.parse(l);
            if (lk.isBody()) {
                bodyKeys.put(l, lk);
            } else {
                defKeys.add(lk.key());
            }
        }
        Map<String, MdmAt> found = new LinkedHashMap<>();
        List<String> missing = new ArrayList<>();
        List<String> unavailable = new ArrayList<>();
        if (!versioned) {
            // 결과는 요청한 논리 키로 — 버전 분기와 같게 정의 키 먼저, 그다음 본문 키. 값 해석 실패는 그 키만 받을 수 없음(loadTocs 와 같다).
            Set<String> all = new LinkedHashSet<>(defKeys);
            bodyKeys.values().forEach(lk -> all.add(lk.key()));
            MdmLookup r = reloadValue(type, all);
            for (String k : defKeys) {
                if (r.unavailable().contains(k)) {
                    unavailable.add(k);
                } else if (r.found().containsKey(k)) {
                    try {
                        found.put(k, legacyMdmAt(type, k, r.found().get(k), at));
                    } catch (MdmUnavailableException e) {
                        unavailable.add(k);
                    }
                } else {
                    missing.add(k);
                }
            }
            bodyKeys.forEach((l, lk) -> {
                if (r.unavailable().contains(lk.key())) {
                    unavailable.add(l);
                    return;
                }
                Object full = r.found().get(lk.key());
                if (full == null) {
                    missing.add(l);
                    return;
                }
                try {
                    MdmToc toc = legacyToc(type, lk.key(), full);
                    if (toc.version(lk.ver()).isEmpty()) { // CODE 의 legacyBody 는 ver 를 보지 않는다 — 목차로 먼저 거른다
                        missing.add(l);
                        return;
                    }
                    found.put(l, new MdmAt(toc, lk.ver(), legacyBody(type, full, lk.ver()).orElse(null)));
                } catch (RuntimeException e) {
                    unavailable.add(l);
                }
            });
            return new MdmAtLookup(found, missing, unavailable);
        }
        defKeys.forEach(k -> cache.evictLocal(type, k));
        MdmAtLookup defs = lookupAtVersioned(type, defKeys, at, true, false);
        found.putAll(defs.found());
        missing.addAll(defs.missing());
        unavailable.addAll(defs.unavailable());
        bodyKeys.forEach((l, lk) -> {
            cache.evictLocalBody(type, lk.key(), lk.ver());
            try {
                Optional<MdmToc> toc = toc(type, lk.key());
                if (toc.isEmpty() || toc.get().version(lk.ver()).isEmpty()) {
                    missing.add(l);
                    return;
                }
                MdmBodyKey bk = new MdmBodyKey(lk.key(), lk.ver());
                Bodies b = bodies(type, Map.of(bk, toc.get()), Map.of(), false);
                if (b.found().containsKey(bk)) {
                    found.put(l, new MdmAt(toc.get(), lk.ver(), b.found().get(bk)));
                } else {
                    unavailable.add(l);
                }
            } catch (MdmUnavailableException e) {
                unavailable.add(l);
            }
        });
        return new MdmAtLookup(found, missing, unavailable);
    }

    // ------------------------------------------------------------------ 버전 경로 내부

    private MdmAtLookup lookupAtVersioned(MdmTargetType type, List<String> keys, LocalDateTime at, boolean retry, boolean join) {
        Tocs s = tocs(type, keys, at, join);
        Map<String, MdmAt> found = new LinkedHashMap<>();
        Set<String> missing = new LinkedHashSet<>();
        Set<String> unavailable = new LinkedHashSet<>(s.unavailable());
        Map<MdmBodyKey, MdmToc> need = new LinkedHashMap<>();
        s.tocs().forEach((key, toc) -> {
            if (toc == null) {
                missing.add(key);
                return;
            }
            Optional<String> ver = MdmVersionSelector.select(type, toc, at);
            if (ver.isEmpty()) {
                found.put(key, new MdmAt(toc, null, null));
            } else {
                need.put(new MdmBodyKey(key, ver.get()), toc);
            }
        });
        Bodies b = bodies(type, need, s.current(), join);
        List<String> stale = new ArrayList<>();
        need.forEach((bk, toc) -> {
            if (b.found().containsKey(bk)) {
                found.put(bk.key(), new MdmAt(toc, bk.ver(), b.found().get(bk)));
            } else if (b.unavailable().contains(bk)) {
                unavailable.add(bk.key());
            } else {
                stale.add(bk.key());
            }
        });
        if (!stale.isEmpty()) {
            if (retry) {
                stale.forEach(k -> cache.evictLocal(type, k));
                MdmAtLookup again = lookupAtVersioned(type, stale, at, false, false);
                found.putAll(again.found());
                missing.addAll(again.missing());
                unavailable.addAll(again.unavailable());
            } else {
                unavailable.addAll(stale);
            }
        }
        Map<String, MdmAt> ordered = new LinkedHashMap<>();
        List<String> orderedMissing = new ArrayList<>();
        List<String> orderedUnavailable = new ArrayList<>();
        for (String k : keys) {
            if (found.containsKey(k)) {
                ordered.put(k, found.get(k));
            } else if (unavailable.contains(k)) {
                orderedUnavailable.add(k);
            } else if (missing.contains(k)) {
                orderedMissing.add(k);
            }
        }
        return new MdmAtLookup(ordered, orderedMissing, orderedUnavailable);
    }

    private Tocs tocs(MdmTargetType type, Collection<String> keys, LocalDateTime at, boolean join) {
        Map<String, MdmToc> tocs = new LinkedHashMap<>();
        Set<String> unavailable = new LinkedHashSet<>();
        Map<String, MdmCurrent> current = new ConcurrentHashMap<>();
        Map<String, CompletableFuture<Optional<MdmToc>>> mine = new LinkedHashMap<>();
        Map<String, CompletableFuture<Optional<MdmToc>>> waiting = new LinkedHashMap<>();
        for (String key : keys) {
            Optional<MdmMetaCache.Entry> hit = cache.get(type, key);
            if (hit.isPresent()) {
                tocs.put(key, (MdmToc) hit.get().value());
                continue;
            }
            CompletableFuture<Optional<MdmToc>> f = new CompletableFuture<>();
            if (!join) {
                inflightToc.put(id(type, key), f);
                mine.put(key, f);
                continue;
            }
            CompletableFuture<Optional<MdmToc>> running = inflightToc.putIfAbsent(id(type, key), f);
            if (running == null) {
                mine.put(key, f);
            } else {
                waiting.put(key, running);
            }
        }
        if (!mine.isEmpty()) {
            loadTocs(type, mine, at, current);
        }
        Map<String, CompletableFuture<Optional<MdmToc>>> all = new LinkedHashMap<>(mine);
        all.putAll(waiting);
        all.forEach((key, f) -> {
            try {
                tocs.put(key, f.get(WAIT_LIMIT.toMillis(), TimeUnit.MILLISECONDS).orElse(null));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                unavailable.add(key);
            } catch (ExecutionException | TimeoutException e) {
                unavailable.add(key);
            }
        });
        return new Tocs(tocs, unavailable, current);
    }

    private void loadTocs(MdmTargetType type, Map<String, CompletableFuture<Optional<MdmToc>>> mine, LocalDateTime at,
                          Map<String, MdmCurrent> current) {
        MdmMetaCache.Ticket ticket = cache.ticket();
        try {
            if (skipping(mine.values())) {
                return;
            }
            MdmTocResult r;
            try {
                r = feed.fetchToc(type, mine.keySet(), at);
            } catch (RuntimeException e) {
                failed(e, mine.values());
                return;
            }
            health.set(Health.OK);
            Map<String, MdmToc> tocs = new LinkedHashMap<>();
            Map<MdmBodyKey, Object> bodies = new LinkedHashMap<>();
            Map<String, String> failed = new LinkedHashMap<>();
            for (String key : mine.keySet()) {
                if (r.failed().containsKey(key)) {
                    failed.put(key, r.failed().get(key));
                    continue;
                }
                try {
                    if (r.tocs().containsKey(key)) {
                        MdmToc toc = r.tocs().get(key);
                        tocs.put(key, toc);
                        MdmCurrent c = r.current().get(key);
                        if (c != null && toc.version(c.ver()).isPresent()) {
                            Object body = wrap(type, toc, c.ver(), c.body());
                            bodies.put(new MdmBodyKey(key, c.ver()), body);
                            current.put(key, new MdmCurrent(c.ver(), body));
                        }
                    } else if (r.legacy().containsKey(key)) { // 옛 MDM — 전 이력에서 목차와 t 시각 본문을 직접 만든다(§5.8)
                        Object full = r.legacy().get(key);
                        MdmToc toc = MdmLegacyValues.toc(type, full);
                        tocs.put(key, toc);
                        Optional<String> ver = at == null ? Optional.empty() : MdmVersionSelector.select(type, toc, at);
                        ver.flatMap(v -> MdmLegacyValues.body(type, full, v)).ifPresent(body -> {
                            bodies.put(new MdmBodyKey(key, ver.get()), body);
                            current.put(key, new MdmCurrent(ver.get(), body));
                        });
                    } else {
                        tocs.put(key, null); // MDM 에 없음
                    }
                } catch (RuntimeException e) { // 값 해석 실패(손상) — 그 키만 받을 수 없음
                    tocs.remove(key);
                    failed.put(key, "MDM 정의를 해석할 수 없습니다: " + e.getMessage());
                }
            }
            cache.putTocs(type, tocs, ticket);
            cache.putBodies(type, bodies, ticket);
            mine.forEach((key, f) -> {
                if (failed.containsKey(key)) {
                    f.completeExceptionally(new MdmUnavailableException(failed.get(key)));
                } else {
                    f.complete(Optional.ofNullable(tocs.get(key)));
                }
            });
        } finally {
            mine.forEach((key, f) -> {
                f.completeExceptionally(new MdmUnavailableException("적재가 끝나지 않았습니다: " + key));
                inflightToc.remove(id(type, key), f);
            });
        }
    }

    private Bodies bodies(MdmTargetType type, Map<MdmBodyKey, MdmToc> need, Map<String, MdmCurrent> prefetched, boolean join) {
        Map<MdmBodyKey, Object> found = new LinkedHashMap<>();
        Set<MdmBodyKey> unavailable = new LinkedHashSet<>();
        Set<MdmBodyKey> notReleased = new LinkedHashSet<>();
        Map<MdmBodyKey, CompletableFuture<Optional<Object>>> mine = new LinkedHashMap<>();
        Map<MdmBodyKey, CompletableFuture<Optional<Object>>> waiting = new LinkedHashMap<>();
        Map<MdmBodyKey, MdmToc> mineTocs = new LinkedHashMap<>();
        need.forEach((bk, toc) -> {
            MdmCurrent c = prefetched.get(bk.key());
            if (c != null && c.ver().equals(bk.ver())) {
                found.put(bk, c.body());
                return;
            }
            Optional<MdmMetaCache.Entry> hit = cache.getBody(type, bk.key(), bk.ver());
            if (hit.isPresent()) {
                found.put(bk, hit.get().value());
                return;
            }
            CompletableFuture<Optional<Object>> f = new CompletableFuture<>();
            String id = id(type, MdmVersions.logical(bk.key(), bk.ver()));
            CompletableFuture<Optional<Object>> running = join ? inflightBody.putIfAbsent(id, f) : inflightBody.put(id, f);
            if (!join || running == null) {
                mine.put(bk, f);
                mineTocs.put(bk, toc);
            } else {
                waiting.put(bk, running);
            }
        });
        if (!mine.isEmpty()) {
            loadBodies(type, mine, mineTocs);
        }
        Map<MdmBodyKey, CompletableFuture<Optional<Object>>> all = new LinkedHashMap<>(mine);
        all.putAll(waiting);
        all.forEach((bk, f) -> {
            try {
                Optional<Object> v = f.get(WAIT_LIMIT.toMillis(), TimeUnit.MILLISECONDS);
                if (v.isPresent()) {
                    found.put(bk, v.get());
                } else {
                    notReleased.add(bk);
                }
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                unavailable.add(bk);
            } catch (ExecutionException | TimeoutException e) {
                unavailable.add(bk);
            }
        });
        return new Bodies(found, unavailable, notReleased);
    }

    private void loadBodies(MdmTargetType type, Map<MdmBodyKey, CompletableFuture<Optional<Object>>> mine, Map<MdmBodyKey, MdmToc> tocs) {
        MdmMetaCache.Ticket ticket = cache.ticket();
        try {
            if (skipping(mine.values())) {
                return;
            }
            MdmBodyResult r;
            try {
                r = feed.fetchBodies(type, mine.keySet());
            } catch (RuntimeException e) {
                failed(e, mine.values());
                return;
            }
            health.set(Health.OK);
            Map<MdmBodyKey, Object> toCache = new LinkedHashMap<>();
            Map<MdmBodyKey, Object> outcome = new LinkedHashMap<>(); // Optional<Object>(빈 값 = NOT_RELEASED) 또는 RuntimeException
            for (MdmBodyKey bk : mine.keySet()) {
                try {
                    if (r.found().containsKey(bk)) {
                        Object body = wrap(type, tocs.get(bk), bk.ver(), r.found().get(bk));
                        toCache.put(bk, body);
                        outcome.put(bk, Optional.of(body));
                    } else if (r.failed().containsKey(bk)) {
                        String m = r.failed().get(bk);
                        outcome.put(bk, NOT_RELEASED.equals(m) ? Optional.empty() : new MdmUnavailableException(m));
                    } else if (r.legacy().containsKey(bk.key())) { // 옛 MDM — 전 이력에서 자른다(§5.8)
                        Optional<Object> body = MdmLegacyValues.body(type, r.legacy().get(bk.key()), bk.ver());
                        body.ifPresent(b -> toCache.put(bk, b));
                        outcome.put(bk, body);
                    } else if (r.legacyFailed().containsKey(bk.key())) {
                        outcome.put(bk, new MdmUnavailableException(r.legacyFailed().get(bk.key())));
                    } else if (r.legacyAsked().contains(bk.key())) {
                        outcome.put(bk, Optional.empty()); // 옛 MDM 에도 없는 정의 — 목차가 낡았다
                    } else {
                        outcome.put(bk, new MdmUnavailableException("MDM 응답에 본문이 없습니다: " + bk));
                    }
                } catch (RuntimeException e) {
                    outcome.put(bk, new MdmUnavailableException("MDM 본문을 해석할 수 없습니다: " + e.getMessage()));
                }
            }
            cache.putBodies(type, toCache, ticket);
            mine.forEach((bk, f) -> {
                Object o = outcome.get(bk);
                if (o instanceof RuntimeException e) {
                    f.completeExceptionally(e);
                } else {
                    @SuppressWarnings("unchecked")
                    Optional<Object> v = (Optional<Object>) o;
                    f.complete(v);
                }
            });
        } finally {
            mine.forEach((bk, f) -> {
                f.completeExceptionally(new MdmUnavailableException("적재가 끝나지 않았습니다: " + bk));
                inflightBody.remove(id(type, MdmVersions.logical(bk.key(), bk.ver())), f);
            });
        }
    }

    /** off 경로 — 값 해석 실패는 그 키만 받을 수 없음이다(버전 경로 {@code loadTocs} 의 키별 처리와 같은 결과 모양). 요청 순서를 지킨다. */
    private MdmAtLookup legacyAt(MdmTargetType type, List<String> keys, LocalDateTime at) {
        MdmLookup r = lookupValue(type, keys);
        Map<String, MdmAt> found = new LinkedHashMap<>();
        Set<String> broken = new LinkedHashSet<>();
        r.found().forEach((key, full) -> {
            try {
                found.put(key, legacyMdmAt(type, key, full, at));
            } catch (MdmUnavailableException e) {
                broken.add(key);
            }
        });
        if (broken.isEmpty()) {
            return new MdmAtLookup(found, r.missing(), r.unavailable());
        }
        List<String> unavailable = new ArrayList<>();
        for (String k : keys) {
            if (r.unavailable().contains(k) || broken.contains(k)) {
                unavailable.add(k);
            }
        }
        return new MdmAtLookup(found, r.missing(), unavailable);
    }

    /**
     * off 경로 — 전 이력 값 하나를 목차로 바꿔 {@code at} 의 버전을 고르고 그 본문을 감싼다. {@code legacyAt} 과 {@code reloadAt} 의 off 분기(정의 키)가
     * 함께 쓴다. 해석하지 못하면 {@link MdmUnavailableException}.
     */
    private static MdmAt legacyMdmAt(MdmTargetType type, String key, Object full, LocalDateTime at) {
        try {
            MdmToc toc = MdmLegacyValues.toc(type, full);
            String ver = MdmVersionSelector.select(type, toc, at).orElse(null);
            return new MdmAt(toc, ver, ver == null ? null : legacyBody(type, full, ver).orElse(null));
        } catch (RuntimeException e) {
            throw unreadable(type, key, e);
        }
    }

    /** off 경로의 목차 — 해석하지 못하면(null ver·소수 넷째 자리 등) {@link MdmUnavailableException}. */
    private static MdmToc legacyToc(MdmTargetType type, String key, Object full) {
        try {
            return MdmLegacyValues.toc(type, full);
        } catch (RuntimeException e) {
            throw unreadable(type, key, e);
        }
    }

    private static MdmUnavailableException unreadable(MdmTargetType type, String key, RuntimeException e) {
        return e instanceof MdmUnavailableException u ? u
                : new MdmUnavailableException("MDM 정의를 해석할 수 없습니다: " + type + " " + key + " — " + e.getMessage(), e);
    }

    /** off 경로 — CODE 는 전 이력을 그대로 감싼다(호출마다 자르지 않는다). */
    private static Optional<Object> legacyBody(MdmTargetType type, Object full, String ver) {
        return type == MdmTargetType.CODE ? Optional.of(MdmCodeVersion.full((CodeRows) full)) : MdmLegacyValues.rawBody(type, full, ver);
    }

    /** MDM 본문(원시) → 캐시 값. CODE 는 목차의 헤더·버전 행으로 색인을 단다. */
    private static Object wrap(MdmTargetType type, MdmToc toc, String ver, Object raw) {
        if (type != MdmTargetType.CODE) {
            return raw;
        }
        return MdmCodeVersion.sliced((CodeVersionSlice) raw, toc.header(), toc.version(ver).orElseThrow());
    }

    private boolean skipping(Collection<? extends CompletableFuture<?>> futures) {
        Instant until = health.get().skipUntil();
        if (until != null && clock.instant().isBefore(until)) {
            MdmUnavailableException skipped = new MdmUnavailableException("MDM 연속 실패로 " + until + " 까지 호출을 건너뜁니다");
            futures.forEach(f -> f.completeExceptionally(skipped));
            return true;
        }
        return false;
    }

    private void failed(RuntimeException e, Collection<? extends CompletableFuture<?>> futures) {
        Instant now = clock.instant();
        health.updateAndGet(h -> {
            int n = h.failures() + 1;
            return new Health(n, n >= SKIP_AFTER_FAILURES ? now.plus(SKIP_FOR) : h.skipUntil());
        });
        futures.forEach(f -> f.completeExceptionally(e));
    }

    private void guardValue(MdmTargetType type) {
        if (versioned && MdmVersions.isVersioned(type)) {
            throw new IllegalStateException("버전 대상은 lookupAt·oneAt·toc·body 로 조회한다(D-154): " + type);
        }
    }

    private static void requireVersionedType(MdmTargetType type) {
        if (!MdmVersions.isVersioned(type)) {
            throw new IllegalArgumentException("버전이 없는 대상입니다: " + type);
        }
    }

    private static List<String> distinct(Collection<String> keys) {
        List<String> out = new ArrayList<>();
        for (String k : new LinkedHashSet<>(keys)) {
            if (k != null && !k.isBlank()) {
                out.add(k);
            }
        }
        return out;
    }

    private static LocalDateTime kst(Instant t) {
        return LocalDateTime.ofInstant(t, MdmDefinitionLookup.KST);
    }

    private static String id(MdmTargetType type, String key) {
        return type.name() + ':' + key;
    }
}
