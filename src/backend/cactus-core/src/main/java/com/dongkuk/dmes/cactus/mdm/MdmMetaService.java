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
import java.util.function.BiConsumer;
import java.util.function.Consumer;
import java.util.function.Function;
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
            Claim<Optional<Object>> c = claim(inflight, id(type, key), true);
            (c.mine() ? mine : waiting).put(key, c.future());
        }
        if (!mine.isEmpty()) {
            load(type, mine);
        }
        await(joined(mine, waiting), found, missing, unavailable);
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
        return reloadValue(type, keys, true);
    }

    /**
     * 폴러 RELOAD 전용(스펙 §5.6 RELOAD) — 폴러가 이미 지운({@code evict}·{@code markApplied} 뒤) 키를 다시 받는다. 진행 중 적재에 합류하지 않는다(관리
     * 화면 reload 와 같은 자리 빼앗기). 합류하면 지움 전 Ticket 적재의 결과는 캐시에 들어가지 못하고, 그 적재를 최대 {@link #WAIT_LIMIT} 까지
     * 기다린다. 자기 적재의 Ticket 은 지움 뒤에 받으므로 들어간다. 버전 대상(versioned)은 목차와 {@code t} 시각 최종 본문을 한 Ticket 으로 함께
     * 넣는다. 값 대상과 versioned-feed off 의 버전 대상은 값 적재다. 지움 기록은 더하지 않는다(폴러가 남겼다. 본문이 NOT_RELEASED 로 와 다시 받는 재시도만 기존대로 evictLocal 한다). 결과는 버린다 — 받을 수 없는 키는
     * 캐시에 남지 않는다.
     */
    void refreshAfterEvict(MdmTargetType type, Collection<String> keys, Instant t) {
        List<String> wanted = distinct(keys);
        if (wanted.isEmpty()) {
            return;
        }
        if (versioned && MdmVersions.isVersioned(type)) {
            lookupAtVersioned(type, wanted, kst(t), true, false);
        } else {
            reloadValue(type, wanted, false);
        }
    }

    /** @param evictFirst 참이면 이 인스턴스에서 먼저 지운다(관리 화면 reload). 폴러 RELOAD 는 이미 지웠으므로 거짓 */
    private MdmLookup reloadValue(MdmTargetType type, Collection<String> keys, boolean evictFirst) {
        Map<String, CompletableFuture<Optional<Object>>> mine = new LinkedHashMap<>();
        for (String key : new LinkedHashSet<>(keys)) {
            if (key == null || key.isBlank()) {
                continue;
            }
            if (evictFirst) {
                cache.evictLocal(type, key);
            }
            mine.put(key, claim(inflight, id(type, key), false).future()); // 앞선 적재의 자리를 빼앗는다. 앞선 적재는 자기 것만 지우므로 이 자리를 건드리지 않는다
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
        awaitAll(futures, (key, v) -> v.ifPresentOrElse(x -> found.put(key, x), () -> missing.add(key)), unavailable::add);
    }

    private void load(MdmTargetType type, Map<String, CompletableFuture<Optional<Object>>> mine) {
        loadBatch(mine, inflight, key -> id(type, key), keys -> feed.fetch(type, keys), (result, keys, ticket) -> {
            Map<String, Object> toCache = new LinkedHashMap<>();
            keys.forEach(key -> {
                if (!result.failed().containsKey(key)) {
                    toCache.put(key, result.found().get(key)); // null = "없음"
                }
            });
            cache.putAll(type, toCache, ticket);
            Map<String, Outcome<Optional<Object>>> outcome = new LinkedHashMap<>();
            keys.forEach(key -> {
                String failed = result.failed().get(key);
                if (failed != null || result.failed().containsKey(key)) {
                    outcome.put(key, Outcome.fail(new MdmUnavailableException(failed == null ? "MDM 이 정의를 만들지 못했습니다: " + key : failed)));
                } else {
                    outcome.put(key, Outcome.ok(Optional.ofNullable(result.found().get(key))));
                }
            });
            return outcome;
        });
    }

    // ------------------------------------------------------------------ 적재 공통(값·목차·본문)

    /** 진행 중 적재 자리 — {@code mine} 이면 내가 적재하고, 아니면 {@code future} 는 남의 진행 중 적재다. */
    private record Claim<V>(CompletableFuture<V> future, boolean mine) {
    }

    /**
     * 진행 중 적재 자리를 잡는다. {@code join} 이면 진행 중 적재에 합류하고(putIfAbsent), 아니면 자리를 빼앗는다(put — reload·폴러 RELOAD). 앞선
     * 적재는 {@link #loadBatch} 의 finally 에서 자기 future 만 지우므로 빼앗은 자리를 건드리지 않는다.
     */
    private static <V> Claim<V> claim(ConcurrentHashMap<String, CompletableFuture<V>> inflight, String id, boolean join) {
        CompletableFuture<V> f = new CompletableFuture<>();
        CompletableFuture<V> running = join ? inflight.putIfAbsent(id, f) : inflight.put(id, f);
        return !join || running == null ? new Claim<>(f, true) : new Claim<>(running, false);
    }

    /** 키 하나의 적재 결과 — 값, 또는 받을 수 없음({@code error}). */
    private record Outcome<V>(V value, RuntimeException error) {
        static <V> Outcome<V> ok(V value) {
            return new Outcome<>(value, null);
        }

        static <V> Outcome<V> fail(RuntimeException error) {
            return new Outcome<>(null, error);
        }
    }

    /** 해석·캐시 쓰기 — feed 응답을 해석해 받은 Ticket 으로 캐시에 넣고, {@code keys} 의 키마다 결과를 낸다. */
    @FunctionalInterface
    private interface Settle<K, R, V> {
        Map<K, Outcome<V>> apply(R response, Set<K> keys, MdmMetaCache.Ticket ticket);
    }

    /**
     * 적재 한 묶음 — 값·목차·본문이 함께 쓰는 골격. ① 호출 전에 Ticket 을 받는다 ② 건너뛰는 중이면 모두 받을 수 없음 ③ feed 호출만 실패로 센다
     * (RuntimeException → {@link #failed}) ④ 호출이 성공하면 health 를 OK 로 ⑤ 해석·캐시 쓰기({@code settle}) ⑥ 그 뒤에 키별로 완료한다 — 합류자가
     * 깨어나면 캐시가 이미 채워져 있다. 해석·캐시 쓰기 단계의 예외는 실패로 세지 않고 호출자에게 나가며, finally 가 남은 future 를 "적재가 끝나지
     * 않았습니다" 로 닫는다. finally 는 진행 중 장부에서 자기 future 만 지운다(remove(id, f)) — 자리를 빼앗은 새 적재를 지우지 않는다.
     */
    private <K, V, R> void loadBatch(Map<K, CompletableFuture<V>> mine, ConcurrentHashMap<String, CompletableFuture<V>> inflight,
                                     Function<K, String> inflightId, Function<Set<K>, R> fetch, Settle<K, R, V> settle) {
        MdmMetaCache.Ticket ticket = cache.ticket();
        try {
            if (skipping(mine.values())) {
                return;
            }
            R response;
            try {
                response = fetch.apply(mine.keySet());
            } catch (RuntimeException e) {
                failed(e, mine.values());
                return;
            }
            health.set(Health.OK);
            Map<K, Outcome<V>> outcome = settle.apply(response, mine.keySet(), ticket);
            mine.forEach((key, f) -> {
                Outcome<V> o = outcome.get(key);
                if (o.error() != null) {
                    f.completeExceptionally(o.error());
                } else {
                    f.complete(o.value());
                }
            });
        } finally {
            mine.forEach((key, f) -> {
                f.completeExceptionally(new MdmUnavailableException("적재가 끝나지 않았습니다: " + key)); // 이미 끝났으면 무시된다
                inflight.remove(inflightId.apply(key), f);
            });
        }
    }

    /** 진행 중 적재를 {@link #WAIT_LIMIT} 까지 기다린다. 받으면 {@code onValue}, 실패·시간 초과·인터럽트(표시는 되살린다)면 {@code onUnavailable}. */
    private static <K, V> void awaitAll(Map<K, CompletableFuture<V>> futures, BiConsumer<K, V> onValue, Consumer<K> onUnavailable) {
        futures.forEach((key, f) -> {
            try {
                onValue.accept(key, f.get(WAIT_LIMIT.toMillis(), TimeUnit.MILLISECONDS));
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
                onUnavailable.accept(key);
            } catch (ExecutionException | TimeoutException e) {
                onUnavailable.accept(key);
            }
        });
    }

    /** 내 적재 먼저, 그다음 합류한 적재 — 기다리는 순서. */
    private static <K, V> Map<K, CompletableFuture<V>> joined(Map<K, CompletableFuture<V>> mine, Map<K, CompletableFuture<V>> waiting) {
        Map<K, CompletableFuture<V>> all = new LinkedHashMap<>(mine);
        all.putAll(waiting);
        return all;
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
        return versioned ? lookupAtVersioned(type, wanted, at, true, true) : offAt(type, wanted, at);
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
            return oneValue(type, key).map(full -> offToc(type, key, full));
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
                    return offBody(type, full, ver);
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
        return new CachedRead(true, !versioned && v != null ? offToc(type, key, v) : v);
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
                return new CachedRead(true, offBody(type, full, ver).orElse(null));
            } catch (RuntimeException e) {
                throw unreadable(type, key, e); // 손상 값(소수 넷째 자리 ver 등) — body·offMdmAt 과 같다
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
            MdmLookup r = reloadValue(type, all, true);
            for (String k : defKeys) {
                if (r.unavailable().contains(k)) {
                    unavailable.add(k);
                } else if (r.found().containsKey(k)) {
                    try {
                        found.put(k, offMdmAt(type, k, r.found().get(k), at));
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
                    MdmToc toc = offToc(type, lk.key(), full);
                    if (toc.version(lk.ver()).isEmpty()) { // CODE 의 offBody 는 ver 를 보지 않는다 — 목차로 먼저 거른다
                        missing.add(l);
                        return;
                    }
                    found.put(l, new MdmAt(toc, lk.ver(), offBody(type, full, lk.ver()).orElse(null)));
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
            Claim<Optional<MdmToc>> c = claim(inflightToc, id(type, key), join);
            (c.mine() ? mine : waiting).put(key, c.future());
        }
        if (!mine.isEmpty()) {
            loadTocs(type, mine, at, current);
        }
        awaitAll(joined(mine, waiting), (key, v) -> tocs.put(key, v.orElse(null)), unavailable::add);
        return new Tocs(tocs, unavailable, current);
    }

    private void loadTocs(MdmTargetType type, Map<String, CompletableFuture<Optional<MdmToc>>> mine, LocalDateTime at,
                          Map<String, MdmCurrent> current) {
        loadBatch(mine, inflightToc, key -> id(type, key), keys -> feed.fetchToc(type, keys, at), (r, keys, ticket) -> {
            Map<String, MdmToc> tocs = new LinkedHashMap<>();
            Map<MdmBodyKey, Object> bodies = new LinkedHashMap<>();
            Map<String, String> failed = new LinkedHashMap<>();
            for (String key : keys) {
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
            Map<String, Outcome<Optional<MdmToc>>> outcome = new LinkedHashMap<>();
            for (String key : keys) {
                if (failed.containsKey(key)) {
                    outcome.put(key, Outcome.fail(new MdmUnavailableException(failed.get(key))));
                } else {
                    outcome.put(key, Outcome.ok(Optional.ofNullable(tocs.get(key))));
                }
            }
            return outcome;
        });
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
            Claim<Optional<Object>> slot = claim(inflightBody, bodyInflightId(type, bk), join);
            if (slot.mine()) {
                mine.put(bk, slot.future());
                mineTocs.put(bk, toc);
            } else {
                waiting.put(bk, slot.future());
            }
        });
        if (!mine.isEmpty()) {
            loadBodies(type, mine, mineTocs);
        }
        awaitAll(joined(mine, waiting), (bk, v) -> v.ifPresentOrElse(x -> found.put(bk, x), () -> notReleased.add(bk)), unavailable::add);
        return new Bodies(found, unavailable, notReleased);
    }

    private void loadBodies(MdmTargetType type, Map<MdmBodyKey, CompletableFuture<Optional<Object>>> mine, Map<MdmBodyKey, MdmToc> tocs) {
        loadBatch(mine, inflightBody, bk -> bodyInflightId(type, bk), keys -> feed.fetchBodies(type, keys), (r, keys, ticket) -> {
            Map<MdmBodyKey, Object> toCache = new LinkedHashMap<>();
            Map<MdmBodyKey, Outcome<Optional<Object>>> outcome = new LinkedHashMap<>(); // 빈 값 = NOT_RELEASED
            for (MdmBodyKey bk : keys) {
                try {
                    if (r.found().containsKey(bk)) {
                        Object body = wrap(type, tocs.get(bk), bk.ver(), r.found().get(bk));
                        toCache.put(bk, body);
                        outcome.put(bk, Outcome.ok(Optional.of(body)));
                    } else if (r.failed().containsKey(bk)) {
                        String m = r.failed().get(bk);
                        if (NOT_RELEASED.equals(m)) {
                            outcome.put(bk, Outcome.ok(Optional.empty()));
                        } else {
                            outcome.put(bk, Outcome.fail(new MdmUnavailableException(m)));
                        }
                    } else if (r.legacy().containsKey(bk.key())) { // 옛 MDM — 전 이력에서 자른다(§5.8)
                        Optional<Object> body = MdmLegacyValues.body(type, r.legacy().get(bk.key()), bk.ver());
                        body.ifPresent(b -> toCache.put(bk, b));
                        outcome.put(bk, Outcome.ok(body));
                    } else if (r.legacyFailed().containsKey(bk.key())) {
                        outcome.put(bk, Outcome.fail(new MdmUnavailableException(r.legacyFailed().get(bk.key()))));
                    } else if (r.legacyAsked().contains(bk.key())) {
                        outcome.put(bk, Outcome.ok(Optional.empty())); // 옛 MDM 에도 없는 정의 — 목차가 낡았다
                    } else {
                        outcome.put(bk, Outcome.fail(new MdmUnavailableException("MDM 응답에 본문이 없습니다: " + bk)));
                    }
                } catch (RuntimeException e) {
                    outcome.put(bk, Outcome.fail(new MdmUnavailableException("MDM 본문을 해석할 수 없습니다: " + e.getMessage())));
                }
            }
            cache.putBodies(type, toCache, ticket);
            return outcome;
        });
    }

    /** off 경로 — 값 해석 실패는 그 키만 받을 수 없음이다(버전 경로 {@code loadTocs} 의 키별 처리와 같은 결과 모양). 요청 순서를 지킨다. */
    private MdmAtLookup offAt(MdmTargetType type, List<String> keys, LocalDateTime at) {
        MdmLookup r = lookupValue(type, keys);
        Map<String, MdmAt> found = new LinkedHashMap<>();
        Set<String> broken = new LinkedHashSet<>();
        r.found().forEach((key, full) -> {
            try {
                found.put(key, offMdmAt(type, key, full, at));
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
     * off 경로 — 전 이력 값 하나를 목차로 바꿔 {@code at} 의 버전을 고르고 그 본문을 감싼다. {@code offAt} 과 {@code reloadAt} 의 off 분기(정의 키)가
     * 함께 쓴다. 해석하지 못하면 {@link MdmUnavailableException}.
     */
    private static MdmAt offMdmAt(MdmTargetType type, String key, Object full, LocalDateTime at) {
        try {
            MdmToc toc = MdmLegacyValues.toc(type, full);
            String ver = MdmVersionSelector.select(type, toc, at).orElse(null);
            return new MdmAt(toc, ver, ver == null ? null : offBody(type, full, ver).orElse(null));
        } catch (RuntimeException e) {
            throw unreadable(type, key, e);
        }
    }

    /** off 경로의 목차 — 해석하지 못하면(null ver·소수 넷째 자리 등) {@link MdmUnavailableException}. */
    private static MdmToc offToc(MdmTargetType type, String key, Object full) {
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
    private static Optional<Object> offBody(MdmTargetType type, Object full, String ver) {
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

    /** 본문 적재 합류 키 — ver 가 들어간다(같은 코드의 두 버전이 합쳐지지 않게). */
    private static String bodyInflightId(MdmTargetType type, MdmBodyKey bk) {
        return id(type, MdmVersions.logical(bk.key(), bk.ver()));
    }
}
