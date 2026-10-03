package com.dongkuk.dmes.cactus.mdm;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;
import java.util.concurrent.atomic.AtomicReference;

/**
 * MDM 메타 캐시(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.2) — 대상 종류별 {@code ConcurrentHashMap}. 항목은 값 또는
 * "없음", 적재 시각, 마지막 조회 시각, 적재 직전 {@code appliedSeq}, 조회 수, 추정 크기를 가진다. Caffeine 을 쓰지 않는다(§5.1).
 *
 * <p>수명(A2, 2026-10-02): 마지막 조회({@link #get} 히트 — 적재 직후에는 적재 시각) 뒤 {@code max-idle} 동안 다시 조회되지 않거나, 적재 뒤
 * {@code max-age}(절대 상한 — 폴링이 오래 끊겨 지움 기록을 놓친 경우의 안전망)가 지나면 만료다. 즉 자주 조회되는 항목일수록 오래 남되
 * {@code max-age} 를 넘지는 않는다. 만료 항목은 조회 때 버리고, 다시 조회되지 않는 항목도 남지 않게 폴링마다({@link #markApplied}, 약 10초)
 * 쓸어 낸다. 폴링이 실패해 쓸지 못하는 동안에도 {@link #sizes}·{@link #bytes}(관리 화면 상태)는 만료 항목을 세지 않는다 — {@link #entries} 와
 * 같은 기준. {@link #peek}·{@link #entries}(관리 화면)는 마지막 조회 시각·조회 수를 바꾸지 않는다. 적재 시각은 밀리초로 자른다(마지막 조회
 * 시각과 같은 정밀도 — 조회 전에는 둘이 같다).
 *
 * <p>상한: 합계가 {@code max-entries} 를 넘으면 한 번에 {@code max-entries × 0.95} 까지 줄인다 — 만료 항목을 먼저 모두 지우고, 그래도 넘으면
 * 오래 조회되지 않은 순(LRU, 마지막 조회 시각 기준)으로 지운다. 묶음 적재({@link #putAll})는 다 넣은 뒤 한 번만 줄인다(잠금을 쥔 채 정렬을 키
 * 수만큼 반복하지 않는다).
 *
 * <p>추정 크기: 적재 때 값을 {@link MdmJson#MAPPER} 로 직렬화한 UTF-8 바이트 수를 한 번 재어 둔다("없음"은 0, 직렬화 실패는 -1 — 합계에서
 * 뺀다). 직렬화는 잠금 밖에서 한다. JVM 실제 점유는 객체 머리·참조 때문에 이보다 크다.
 *
 * <p>적재와 경합(§5.3-5, Ruling R7): 적재는 시작할 때 {@link Ticket} 을 받고, 넣을 때 아래 셋 중 하나면 넣지 않는다(호출자에게 값은 돌려준다)
 * — 늦게 도착한 옛 값이 남지 않는다. 지움 기록은 5분 뒤 {@link #markApplied} 때 정리한다.
 * <ol>
 *   <li>캐시가 통째로 비워졌다 — {@code ticket.generation} 이 지금 세대와 다르다.</li>
 *   <li>그 키의 지움 기록 순번이 {@code ticket.appliedSeq} 보다 크다(Ticket 이 아직 보지 못한 변경으로 지워졌다).</li>
 *   <li>그 키가 Ticket 을 받은 뒤에 지워졌다 — 지움 기록의 stamp 가 {@code ticket.stamp} 보다 크다.</li>
 * </ol>
 *
 * <p>지움 표지(stamp): 이 캐시 하나에 걸친 단조 증가 계수다. 지움({@link #evict} — 폴러, {@link #evictLocal} — 관리 화면 reload)마다 하나 올려
 * 그 키의 지움 기록에 적고, {@link #ticket()} 은 그때의 값을 담는다. 그래서 순번과 상관없이 "지움보다 먼저 시작한 적재"는 거부되고 "지움 뒤에 시작한
 * 적재"는 바로 넣을 수 있다 — 늦게 커밋된 낮은 순번(되돌아보기)이나 reload 가 순번을 올리지 않아도 옛 값을 막고, 새 적재를 막아 두지 않는다.
 *
 * <p>묶음 구조(D-154, 스펙 2026-10-03-mdm-meta-cache-per-version §5.1·§5.5·§5.6): 정의 키마다 {@code Group} 하나에 머리({@link Part#VALUE} 값
 * 하나 — 컬럼·도메인과 {@code versioned-feed: off} 의 전 이력, 또는 {@link Part#TOC} 목차, 또는 "없음")와 버전 본문들({@link Part#BODY})을 둔다.
 * 지움 기록은 정의 키 하나에 남기고 본문을 넣을 때도 그 기록을 본다 — 본문 키로 찾으면 지움 전에 시작한 본문 적재가 지운 뒤에 옛 값을 다시 넣는다.
 * 본문만 지울 때(관리 화면 본문 재등록)는 본문 키 기록을 따로 남긴다. 본문 유휴 수명은 최종 버전이면 {@code max-idle}, 아니면(옛·예약 버전,
 * 목차 없음) {@code old-version-max-idle} 이다. 최종 여부는 묶음에 기억한 (고른 버전, 다음 경계)로 판정하고 경계가 지나면 다시 고른다 — 두 선택
 * 규칙 모두 결과가 경계에서만 바뀐다. 시계는 앞으로만 간다고 본다. 상한은 머리와 본문을 합해 센다.
 */
public final class MdmMetaCache {

    static final Duration TOMBSTONE_TTL = Duration.ofMinutes(5);
    /** 상한을 넘었을 때 줄이는 목표 비율. */
    static final double TRIM_TARGET_RATIO = 0.95;

    /** 항목 구분(D-154). VALUE 는 값 하나, TOC 는 목차, BODY 는 버전 본문. */
    public enum Part { VALUE, TOC, BODY }

    private final int maxEntries;
    private final int trimTarget;
    private final Duration maxAge;
    private final Duration maxIdle;
    /** 옛 버전·예약 버전·목차 없는 본문의 유휴 수명(결정 P6·P9). */
    private final Duration oldVersionMaxIdle;
    private final Clock clock;
    private final Map<MdmTargetType, ConcurrentHashMap<String, Group>> maps = new EnumMap<>(MdmTargetType.class);
    private final ConcurrentHashMap<String, Tombstone> tombstones = new ConcurrentHashMap<>();
    private final AtomicLong generation = new AtomicLong();
    private final AtomicLong stamps = new AtomicLong();
    private volatile long appliedSeq = -1L;
    private volatile long trimPasses;

    /** 유휴 수명을 절대 상한과 같게 둔다 — 적재 뒤 {@code maxAge} 만 보는 예전 동작이다. */
    public MdmMetaCache(int maxEntries, Duration maxAge, Clock clock) {
        this(maxEntries, maxAge, maxAge, clock);
    }

    /** 옛 버전 본문 수명을 {@code maxIdle} 과 같게 둔다(D-154 전 동작). */
    public MdmMetaCache(int maxEntries, Duration maxAge, Duration maxIdle, Clock clock) {
        this(maxEntries, maxAge, maxIdle, maxIdle, clock);
    }

    /**
     * @param maxAge            적재 뒤 절대 상한
     * @param maxIdle           마지막 조회 뒤 유휴 수명 — 값·목차·최종 본문
     * @param oldVersionMaxIdle 옛 버전·예약 버전·목차 없는 본문의 유휴 수명
     */
    public MdmMetaCache(int maxEntries, Duration maxAge, Duration maxIdle, Duration oldVersionMaxIdle, Clock clock) {
        this.maxEntries = Math.max(1, maxEntries);
        this.trimTarget = Math.max(1, (int) (this.maxEntries * TRIM_TARGET_RATIO));
        this.maxAge = maxAge;
        this.maxIdle = maxIdle;
        this.oldVersionMaxIdle = oldVersionMaxIdle;
        this.clock = clock;
        for (MdmTargetType t : MdmTargetType.values()) {
            maps.put(t, new ConcurrentHashMap<>());
        }
    }

    /** 캐시 한 칸. {@code value} 가 null 이면 "MDM 에 없음"이다(본문은 늘 값이 있다). */
    public static final class Entry {
        private final Object value;
        private final Instant loadedAt;
        private final long loadSeq;
        private final long bytes;
        private final Part part;
        /** 본문의 ver 키(scale 3). 머리는 null. */
        private final String ver;
        private final AtomicLong hits = new AtomicLong();
        private volatile long lastAccessMillis;

        Entry(Object value, Instant loadedAt, long loadSeq, long bytes, Part part, String ver) {
            this.value = value;
            this.loadedAt = loadedAt.truncatedTo(ChronoUnit.MILLIS);
            this.loadSeq = loadSeq;
            this.bytes = bytes;
            this.part = part;
            this.ver = ver;
            this.lastAccessMillis = this.loadedAt.toEpochMilli();
        }

        public Object value() { return value; }
        public boolean absent() { return value == null; }
        public Instant loadedAt() { return loadedAt; }
        public long loadSeq() { return loadSeq; }
        public long hits() { return hits.get(); }
        public long bytes() { return bytes; }
        public Instant lastAccessAt() { return Instant.ofEpochMilli(lastAccessMillis); }
        public Part part() { return part; }
        public String ver() { return ver; }
    }

    /** 정의 키 하나의 묶음 — 머리와 버전 본문들. 머리·본문을 넣고 묶음을 지우는 일은 {@code this} 잠금 안에서만 한다. */
    private static final class Group {
        final AtomicReference<Entry> head = new AtomicReference<>();
        final ConcurrentHashMap<String, Entry> bodies = new ConcurrentHashMap<>();
        /** 목차로 고른 최종 버전과 다시 골라야 하는 시각 — 한 값으로 바꾼다. null 이면 아직 고르지 않았다. */
        volatile Current current;

        boolean isEmpty() {
            return head.get() == null && bodies.isEmpty();
        }
    }

    /**
     * 최종 버전(없으면 null)과 그 판정이 맞는 마지막 시각(이 시각 전까지, KST). {@code toc} 는 판정에 쓴 목차다 — 잠금 밖 판정이 옛 목차로 고른
     * 값을 새 목차를 넣은 뒤에 써도, 다음 판정이 목차가 다르면 버리고 다시 고른다(참조 비교).
     */
    private record Current(MdmToc toc, String ver, LocalDateTime until) {
    }

    /** 관리 화면용 항목 한 줄. {@code key} 는 논리 키(본문은 {@code X@ver}), {@code current} 는 본문만(최종 버전이면 참). */
    public record EntryView(MdmTargetType type, String key, boolean absent, Object value, Instant loadedAt, long hits,
                            long remainingSeconds, long loadSeq, Instant lastAccessAt, long bytes, Part part, String ver, Boolean current) {
    }

    /**
     * 적재 시작 때의 캐시 세대, 적용 순번, 지움 표지. 두 값 생성자는 표지를 {@code Long.MAX_VALUE} 로 둔다(표지 검사를 하지 않는다 — 예전
     * 두 값 Ticket 과 같은 판정).
     */
    public record Ticket(long generation, long appliedSeq, long stamp) {
        public Ticket(long generation, long appliedSeq) {
            this(generation, appliedSeq, Long.MAX_VALUE);
        }
    }

    /** 지움 기록 — 순번(폴러 지움만, 이 인스턴스 지움은 {@code Long.MIN_VALUE}), 시각, 표지. */
    private record Tombstone(long seq, Instant at, long stamp) {
    }

    public int maxEntries() {
        return maxEntries;
    }

    /** 적재 뒤 절대 상한. */
    public Duration maxAge() {
        return maxAge;
    }

    /** 마지막 조회 뒤 유휴 수명. */
    public Duration maxIdle() {
        return maxIdle;
    }

    /** 첫 폴링 전에는 -1. */
    public long appliedSeq() {
        return appliedSeq;
    }

    public synchronized Ticket ticket() {
        return new Ticket(generation.get(), appliedSeq, stamps.get());
    }

    public Duration oldVersionMaxIdle() {
        return oldVersionMaxIdle;
    }

    // ------------------------------------------------------------------ 머리(값·목차)

    public Optional<Entry> get(MdmTargetType type, String key) {
        Group g = maps.get(type).get(key);
        Entry e = g == null ? null : g.head.get();
        if (e == null) {
            return Optional.empty();
        }
        Instant now = clock.instant();
        if (expired(type, g, e, now)) { // 연장하기 전의 마지막 조회 시각으로 판정한다
            g.head.compareAndSet(e, null);
            return Optional.empty();
        }
        touch(e, now);
        return Optional.of(e);
    }

    /**
     * 적재 결과를 넣는다. 넣지 않았으면 false(경합 — 호출자는 값을 돌려주되 캐시하지 않은 것이다). 추정 크기는 잠금 밖에서 잰다(잠금은
     * {@link #ticket}·{@link #evict}·{@link #clear} 와 같은 {@code this}).
     */
    public boolean put(MdmTargetType type, String key, Object value, Ticket ticket) {
        long bytes = sizeOf(value);
        synchronized (this) {
            boolean put = putHead(type, key, value, Part.VALUE, bytes, ticket, clock.instant());
            trimIfOver();
            return put;
        }
    }

    /**
     * 같은 Ticket 으로 받은 묶음을 넣고 상한 정리는 한 번만 한다. 값이 null 이면 "없음"이다(맵은 null 값을 받아야 한다).
     *
     * @return 실제로 넣은 키(경합으로 거른 키는 빠진다)
     */
    public Set<String> putAll(MdmTargetType type, Map<String, Object> values, Ticket ticket) {
        return putHeads(type, values, Part.VALUE, ticket);
    }

    /** 목차 묶음(D-154). 값이 null 이면 "MDM 에 없음". 목차를 바꾸면 그 묶음의 최종 버전을 다시 고른다. @return 실제로 넣은 키(경합으로 거른 키는 빠진다) */
    public Set<String> putTocs(MdmTargetType type, Map<String, MdmToc> tocs, Ticket ticket) {
        return putHeads(type, new LinkedHashMap<>(tocs), Part.TOC, ticket);
    }

    private Set<String> putHeads(MdmTargetType type, Map<String, ?> values, Part part, Ticket ticket) {
        Map<String, Long> sizes = new HashMap<>(); // 직렬화는 잠금 밖에서
        values.forEach((key, value) -> sizes.put(key, sizeOf(value)));
        synchronized (this) {
            Instant now = clock.instant();
            Set<String> put = new LinkedHashSet<>();
            values.forEach((key, value) -> {
                if (putHead(type, key, value, part, sizes.get(key), ticket, now)) {
                    put.add(key);
                }
            });
            trimIfOver();
            return put;
        }
    }

    // ------------------------------------------------------------------ 본문

    public Optional<Entry> getBody(MdmTargetType type, String key, String ver) {
        Group g = maps.get(type).get(key);
        Entry e = g == null ? null : g.bodies.get(ver);
        if (e == null) {
            return Optional.empty();
        }
        Instant now = clock.instant();
        if (expired(type, g, e, now)) {
            g.bodies.remove(ver, e);
            return Optional.empty();
        }
        touch(e, now);
        return Optional.of(e);
    }

    /** 본문 묶음(D-154). 정의 키의 지움 기록과 그 본문 키의 지움 기록을 모두 본다. @return 실제로 넣은 키 */
    public Set<MdmBodyKey> putBodies(MdmTargetType type, Map<MdmBodyKey, Object> bodies, Ticket ticket) {
        Map<MdmBodyKey, Long> sizes = new HashMap<>();
        bodies.forEach((key, value) -> sizes.put(key, sizeOf(value)));
        synchronized (this) {
            Instant now = clock.instant();
            Set<MdmBodyKey> put = new LinkedHashSet<>();
            bodies.forEach((key, value) -> {
                if (putBody(type, key, value, sizes.get(key), ticket, now)) {
                    put.add(key);
                }
            });
            trimIfOver();
            return put;
        }
    }

    // ------------------------------------------------------------------ 지움

    /** 폴링이 받은 변경 하나 — 정의 키의 묶음(머리 + 본문 전부)을 지우고 정의 키에 지움 기록을 남긴다. */
    public synchronized void evict(MdmTargetType type, String key, long seq) {
        maps.get(type).remove(key);
        tombstone(id(type, key), seq);
    }

    /** 이 인스턴스만 묶음째 지운다(관리 화면 load·NOT_RELEASED 재시도). 순번 없는 지움 기록(표지만)을 남긴다. */
    public synchronized void evictLocal(MdmTargetType type, String key) {
        maps.get(type).remove(key);
        tombstone(id(type, key), Long.MIN_VALUE);
    }

    /** 이 인스턴스에서 본문 하나만 지운다(관리 화면 본문 재등록). 그 본문 키에만 순번 없는 지움 기록을 남긴다. */
    public synchronized void evictLocalBody(MdmTargetType type, String key, String ver) {
        Group g = maps.get(type).get(key);
        if (g != null) {
            g.bodies.remove(ver);
            if (g.isEmpty()) {
                maps.get(type).remove(key, g);
            }
        }
        tombstone(bodyId(type, key, ver), Long.MIN_VALUE);
    }

    /** 통째로 비운다(기동·truncated·역행, §5.3). 그 전에 시작한 적재는 넣지 않는다. */
    public synchronized void clear(long newAppliedSeq) {
        maps.values().forEach(Map::clear);
        tombstones.clear();
        generation.incrementAndGet();
        appliedSeq = newAppliedSeq;
    }

    /**
     * 폴링이 순번을 반영한 뒤 부른다(약 10초마다). 5분 지난 지움 기록을 정리하고, 만료된 머리·본문과 빈 묶음을 쓸어 낸다 — 한 번 적재되고 다시
     * 조회되지 않는 항목이 {@link #get}·상한 정리 때까지 맵에 남지 않게. 본문을 먼저 본다(최종 판정에 목차를 쓴다). 쓸기는 만료 항목만 지운다
     * ({@code remove(ver, entry)}·{@code compareAndSet(entry, null)}·{@code remove(key, group)} — 그사이 새로 넣은 값은 남는다). 살아 있는 항목·조회 수·
     * 마지막 조회 시각·지움 기록(5분 규칙 밖)·세대는 건드리지 않는다.
     */
    public synchronized void markApplied(long seq) {
        appliedSeq = seq;
        Instant now = clock.instant();
        Instant limit = now.minus(TOMBSTONE_TTL);
        tombstones.values().removeIf(t -> t.at().isBefore(limit));
        for (Map.Entry<MdmTargetType, ConcurrentHashMap<String, Group>> m : maps.entrySet()) {
            MdmTargetType type = m.getKey();
            m.getValue().forEach((key, g) -> {
                g.bodies.forEach((ver, b) -> {
                    if (expired(type, g, b, now)) {
                        g.bodies.remove(ver, b);
                    }
                });
                Entry h = g.head.get();
                if (h != null && expired(type, g, h, now)) {
                    g.head.compareAndSet(h, null);
                }
                if (g.isEmpty()) {
                    m.getValue().remove(key, g);
                }
            });
        }
    }

    // ------------------------------------------------------------------ 관리 화면(읽기만)

    /** 종류별 살아 있는 항목 수(머리 + 본문). */
    public Map<MdmTargetType, Integer> sizes() {
        return count(true);
    }

    /** 종류별 살아 있는 본문 수(D-154 상태 응답 {@code bodyCounts}). */
    public Map<MdmTargetType, Integer> bodySizes() {
        return count(false);
    }

    private Map<MdmTargetType, Integer> count(boolean withHeads) {
        Instant now = clock.instant();
        Map<MdmTargetType, Integer> out = new EnumMap<>(MdmTargetType.class);
        maps.forEach((t, m) -> {
            int n = 0;
            for (Group g : m.values()) {
                Entry h = g.head.get();
                if (withHeads && h != null && !expired(t, g, h, now)) {
                    n++;
                }
                for (Entry b : g.bodies.values()) {
                    if (!expired(t, g, b, now)) {
                        n++;
                    }
                }
            }
            out.put(t, n);
        });
        return out;
    }

    /** 종류별 추정 크기 합계 — {@link #sizes} 와 같은 항목. 잴 수 없는 항목(-1)은 뺀다. */
    public Map<MdmTargetType, Long> bytes() {
        Instant now = clock.instant();
        Map<MdmTargetType, Long> out = new EnumMap<>(MdmTargetType.class);
        maps.forEach((t, m) -> {
            long sum = 0;
            for (Group g : m.values()) {
                Entry h = g.head.get();
                if (h != null && h.bytes() > 0 && !expired(t, g, h, now)) {
                    sum += h.bytes();
                }
                for (Entry b : g.bodies.values()) {
                    if (b.bytes() > 0 && !expired(t, g, b, now)) {
                        sum += b.bytes();
                    }
                }
            }
            out.put(t, sum);
        });
        return out;
    }

    /**
     * 항목 하나를 읽기만 한다(관리 화면 항목 상세 보기). 버전 대상이면 {@code key} 는 논리 키({@code X} 또는 {@code X@1.000})다. {@link #get} 과 달리
     * 조회 수·마지막 조회 시각을 바꾸지 않고, 만료 항목도 지우지 않은 채 "없음"(빈 값)으로 답한다 — 조회 수·지움 기록·세대를 바꾸지 않는다(본문의 최종
     * 여부를 판정하며 묶음의 최종 버전 기억만 고칠 수 있다). MDM 적재도 하지 않는다.
     */
    public Optional<EntryView> peek(MdmTargetType type, String key) {
        if (type == null || key == null) {
            return Optional.empty();
        }
        MdmVersions.LogicalKey lk = MdmVersions.isVersioned(type) ? MdmVersions.parse(key) : new MdmVersions.LogicalKey(key, null);
        Group g = maps.get(type).get(lk.key());
        if (g == null) {
            return Optional.empty();
        }
        Entry e = lk.isBody() ? g.bodies.get(lk.ver()) : g.head.get();
        Instant now = clock.instant();
        if (e == null || expired(type, g, e, now)) {
            return Optional.empty();
        }
        return Optional.of(view(type, lk.key(), g, e, now));
    }

    /** 대상 종류(null 이면 전체)·논리 키 부분 일치(대소문자 무시)로 거른 항목. 종류·논리 키 순. 읽기만 한다. */
    public List<EntryView> entries(MdmTargetType type, String q) {
        Instant now = clock.instant();
        String needle = q == null || q.isBlank() ? null : q.trim().toUpperCase(Locale.ROOT);
        List<EntryView> out = new ArrayList<>();
        for (MdmTargetType t : MdmTargetType.values()) {
            if (type != null && type != t) {
                continue;
            }
            maps.get(t).forEach((key, g) -> {
                Entry h = g.head.get();
                if (h != null && !expired(t, g, h, now) && matches(needle, key)) {
                    out.add(view(t, key, g, h, now));
                }
                g.bodies.forEach((ver, b) -> {
                    if (!expired(t, g, b, now) && matches(needle, MdmVersions.logical(key, ver))) {
                        out.add(view(t, key, g, b, now));
                    }
                });
            });
        }
        out.sort(Comparator.comparing((EntryView v) -> v.type().ordinal()).thenComparing(EntryView::key));
        return out;
    }

    private static boolean matches(String needle, String logicalKey) {
        return needle == null || logicalKey.toUpperCase(Locale.ROOT).contains(needle);
    }

    private EntryView view(MdmTargetType type, String key, Group g, Entry e, Instant now) {
        long lastAccess = e.lastAccessMillis;
        long remaining = Math.max(0L, Duration.between(now, expiresAt(e, lastAccess, idle(type, g, e, now))).getSeconds());
        Boolean current = e.part == Part.BODY ? isCurrent(type, g, e.ver, now) : null;
        return new EntryView(type, MdmVersions.logical(key, e.ver), e.absent(), e.value(), e.loadedAt(), e.hits(), remaining, e.loadSeq(),
                Instant.ofEpochMilli(lastAccess), e.bytes(), e.part, e.ver, current);
    }

    int tombstoneCount() {
        return tombstones.size();
    }

    /** 시험용 — 맵에 실제로 남은 칸 수(머리 + 본문, 아직 쓸리지 않은 만료 항목 포함). {@link #sizes} 는 만료 항목을 세지 않는다. */
    int storedCount(MdmTargetType type) {
        int n = 0;
        for (Group g : maps.get(type).values()) {
            n += (g.head.get() == null ? 0 : 1) + g.bodies.size();
        }
        return n;
    }

    /** 시험용 — 상한 정리를 실제로 한 횟수. */
    long trimPasses() {
        return trimPasses;
    }

    // ------------------------------------------------------------------ 내부

    private static void touch(Entry e, Instant now) {
        e.lastAccessMillis = now.toEpochMilli();
        e.hits.incrementAndGet();
    }

    /** 잠금 안에서 부른다. */
    private boolean putHead(MdmTargetType type, String key, Object value, Part part, long bytes, Ticket ticket, Instant now) {
        if (ticket.generation() != generation.get() || blocked(id(type, key), ticket)) {
            return false;
        }
        Group g = maps.get(type).computeIfAbsent(key, k -> new Group());
        g.head.set(new Entry(value, now, ticket.appliedSeq(), bytes, part, null));
        if (part == Part.TOC) {
            g.current = null;
        }
        return true;
    }

    /** 잠금 안에서 부른다. 정의 키 기록과 본문 키 기록 둘 다 본다. */
    private boolean putBody(MdmTargetType type, MdmBodyKey k, Object value, long bytes, Ticket ticket, Instant now) {
        if (ticket.generation() != generation.get() || blocked(id(type, k.key()), ticket) || blocked(bodyId(type, k.key(), k.ver()), ticket)) {
            return false;
        }
        Group g = maps.get(type).computeIfAbsent(k.key(), x -> new Group());
        g.bodies.put(k.ver(), new Entry(value, now, ticket.appliedSeq(), bytes, Part.BODY, k.ver()));
        return true;
    }

    private boolean blocked(String id, Ticket ticket) {
        Tombstone t = tombstones.get(id);
        return t != null && (t.seq() > ticket.appliedSeq() || t.stamp() > ticket.stamp());
    }

    /** 잠금 안에서 부른다. */
    private void tombstone(String id, long seq) {
        long stamp = stamps.incrementAndGet();
        Instant now = clock.instant();
        tombstones.merge(id, new Tombstone(seq, now, stamp),
                (old, fresh) -> new Tombstone(Math.max(old.seq(), fresh.seq()), fresh.at(), fresh.stamp()));
    }

    /** 잠금 안에서 부른다. 머리와 본문을 합해 세고, 넘으면 만료 먼저·그다음 오래 조회되지 않은 순(LRU)으로 목표치까지 줄인다. */
    private void trimIfOver() {
        int total = 0;
        for (ConcurrentHashMap<String, Group> m : maps.values()) {
            for (Group g : m.values()) {
                total += (g.head.get() == null ? 0 : 1) + g.bodies.size();
            }
        }
        if (total <= maxEntries) {
            return;
        }
        trimPasses++;
        Instant now = clock.instant();
        // 마지막 조회 시각은 정렬 중에도 get·getBody 가 옮길 수 있다 — 스냅샷으로 정렬해 Comparator 계약을 지킨다.
        record Slot(Group group, String ver, Entry entry, long lastAccess) {
        }
        List<Slot> live = new ArrayList<>();
        for (Map.Entry<MdmTargetType, ConcurrentHashMap<String, Group>> m : maps.entrySet()) {
            MdmTargetType type = m.getKey();
            for (Group g : m.getValue().values()) {
                g.bodies.forEach((ver, b) -> {
                    if (expired(type, g, b, now)) {
                        g.bodies.remove(ver, b);
                    } else {
                        live.add(new Slot(g, ver, b, b.lastAccessMillis));
                    }
                });
                Entry h = g.head.get();
                if (h != null) {
                    if (expired(type, g, h, now)) {
                        g.head.compareAndSet(h, null);
                    } else {
                        live.add(new Slot(g, null, h, h.lastAccessMillis));
                    }
                }
            }
        }
        int over = live.size() - trimTarget;
        if (over > 0) {
            live.sort(Comparator.comparingLong(Slot::lastAccess));
            for (int i = 0; i < over; i++) {
                Slot s = live.get(i);
                if (s.ver() == null) {
                    s.group().head.compareAndSet(s.entry(), null);
                } else {
                    s.group().bodies.remove(s.ver(), s.entry());
                }
            }
        }
        maps.values().forEach(m -> m.forEach((k, g) -> {
            if (g.isEmpty()) {
                m.remove(k, g);
            }
        }));
    }

    /** 본문이고 최종 버전이 아니면 {@code old-version-max-idle}, 그 밖은 {@code max-idle}. */
    private Duration idle(MdmTargetType type, Group g, Entry e, Instant now) {
        return e.part == Part.BODY && !isCurrent(type, g, e.ver, now) ? oldVersionMaxIdle : maxIdle;
    }

    private boolean expired(MdmTargetType type, Group g, Entry e, Instant now) {
        return !expiresAt(e, e.lastAccessMillis, idle(type, g, e, now)).isAfter(now);
    }

    /** 두 기한 중 이른 쪽 — 마지막 조회 + 유휴 수명, 적재 + maxAge. */
    private Instant expiresAt(Entry e, long lastAccessMillis, Duration idle) {
        Instant byIdle = Instant.ofEpochMilli(lastAccessMillis).plus(idle);
        Instant byAge = e.loadedAt().plus(maxAge);
        return byIdle.isBefore(byAge) ? byIdle : byAge;
    }

    /**
     * 최종 버전인가(스펙 §5.5) — 살아 있는 목차가 있을 때만. 묶음에 기억한 판정이 같은 목차·다음 경계 전이면 그대로 쓰고, 경계를 지났거나 목차가 바뀌었거나 처음이면 목차와 지금
     * 시각(KST)으로 다시 고른다. 목차가 없거나 만료됐으면 옛 버전이다.
     */
    private boolean isCurrent(MdmTargetType type, Group g, String ver, Instant now) {
        Entry head = g.head.get();
        if (head == null || head.part != Part.TOC || !(head.value instanceof MdmToc toc)
                || !expiresAt(head, head.lastAccessMillis, maxIdle).isAfter(now)) {
            return false;
        }
        LocalDateTime t = LocalDateTime.ofInstant(now, MdmDefinitionLookup.KST);
        Current c = g.current;
        if (c == null || c.toc() != toc || !t.isBefore(c.until())) {
            c = new Current(toc, MdmVersionSelector.select(type, toc, t).orElse(null), MdmVersionSelector.nextBoundary(toc, t));
            g.current = c;
        }
        return ver.equals(c.ver());
    }

    /** 추정 크기 — UTF-8 JSON 직렬화 바이트 수. "없음"은 0, 직렬화 실패는 조용히 -1(화면은 "-"). */
    static long sizeOf(Object value) {
        if (value == null) {
            return 0L;
        }
        try {
            return MdmJson.MAPPER.writeValueAsBytes(value).length;
        } catch (Exception e) {
            return -1L;
        }
    }

    private static String id(MdmTargetType type, String key) {
        return type.name() + ':' + key;
    }

    private static String bodyId(MdmTargetType type, String key, String ver) {
        return type.name() + ':' + MdmVersions.logical(key, ver);
    }
}
