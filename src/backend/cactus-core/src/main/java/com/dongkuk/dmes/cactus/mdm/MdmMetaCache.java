package com.dongkuk.dmes.cactus.mdm;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * MDM 메타 캐시(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.2) — 대상 종류별 {@code ConcurrentHashMap}. 항목은 값 또는
 * "없음", 적재 시각, 적재 직전 {@code appliedSeq}, 조회 수를 가진다. {@code max-age} 가 지난 항목은 조회 때 버린다. Caffeine 을 쓰지 않는다(§5.1).
 *
 * <p>상한: 합계가 {@code max-entries} 를 넘으면 한 번에 {@code max-entries × 0.95} 까지 줄인다 — {@code max-age} 가 지난 항목을 먼저 모두
 * 지우고, 그래도 넘으면 적재가 오래된 순으로 지운다. 묶음 적재({@link #putAll})는 다 넣은 뒤 한 번만 줄인다(잠금을 쥔 채 정렬을 키 수만큼
 * 반복하지 않는다).
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
 */
public final class MdmMetaCache {

    static final Duration TOMBSTONE_TTL = Duration.ofMinutes(5);
    /** 상한을 넘었을 때 줄이는 목표 비율. */
    static final double TRIM_TARGET_RATIO = 0.95;

    private final int maxEntries;
    private final int trimTarget;
    private final Duration maxAge;
    private final Clock clock;
    private final Map<MdmTargetType, ConcurrentHashMap<String, Entry>> maps = new EnumMap<>(MdmTargetType.class);
    private final ConcurrentHashMap<String, Tombstone> tombstones = new ConcurrentHashMap<>();
    private final AtomicLong generation = new AtomicLong();
    /** 지움마다 하나씩 오르는 표지. Ticket 이 받은 값보다 큰 지움은 그 Ticket 뒤에 일어난 것이다. */
    private final AtomicLong stamps = new AtomicLong();
    private volatile long appliedSeq = -1L;
    private volatile long trimPasses;

    public MdmMetaCache(int maxEntries, Duration maxAge, Clock clock) {
        this.maxEntries = Math.max(1, maxEntries);
        this.trimTarget = Math.max(1, (int) (this.maxEntries * TRIM_TARGET_RATIO));
        this.maxAge = maxAge;
        this.clock = clock;
        for (MdmTargetType t : MdmTargetType.values()) {
            maps.put(t, new ConcurrentHashMap<>());
        }
    }

    /** 캐시 한 칸. {@code value} 가 null 이면 "MDM 에 없음"이다. */
    public static final class Entry {
        private final Object value;
        private final Instant loadedAt;
        private final long loadSeq;
        private final AtomicLong hits = new AtomicLong();

        Entry(Object value, Instant loadedAt, long loadSeq) {
            this.value = value;
            this.loadedAt = loadedAt;
            this.loadSeq = loadSeq;
        }

        public Object value() { return value; }
        public boolean absent() { return value == null; }
        public Instant loadedAt() { return loadedAt; }
        public long loadSeq() { return loadSeq; }
        public long hits() { return hits.get(); }
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

    /** 관리 화면용 항목 한 줄. */
    public record EntryView(MdmTargetType type, String key, boolean absent, Object value, Instant loadedAt, long hits,
                            long remainingSeconds, long loadSeq) {
    }

    /** 지움 기록 — 순번(폴러 지움만, 이 인스턴스 지움은 {@code Long.MIN_VALUE}), 시각, 표지. */
    private record Tombstone(long seq, Instant at, long stamp) {
    }

    public int maxEntries() {
        return maxEntries;
    }

    public Duration maxAge() {
        return maxAge;
    }

    /** 첫 폴링 전에는 -1. */
    public long appliedSeq() {
        return appliedSeq;
    }

    public synchronized Ticket ticket() {
        return new Ticket(generation.get(), appliedSeq, stamps.get());
    }

    public Optional<Entry> get(MdmTargetType type, String key) {
        ConcurrentHashMap<String, Entry> map = maps.get(type);
        Entry e = map.get(key);
        if (e == null) {
            return Optional.empty();
        }
        if (expired(e, clock.instant())) {
            map.remove(key, e);
            return Optional.empty();
        }
        e.hits.incrementAndGet();
        return Optional.of(e);
    }

    /** 적재 결과를 넣는다. 넣지 않았으면 false(경합 — 호출자는 값을 돌려주되 캐시하지 않은 것이다). */
    public synchronized boolean put(MdmTargetType type, String key, Object value, Ticket ticket) {
        boolean put = putOne(type, key, value, ticket, clock.instant());
        trimIfOver();
        return put;
    }

    /**
     * 같은 Ticket 으로 받은 묶음을 넣고 상한 정리는 한 번만 한다. 값이 null 이면 "없음"이다(맵은 null 값을 받아야 한다).
     *
     * @return 실제로 넣은 키(경합으로 거른 키는 빠진다)
     */
    public synchronized Set<String> putAll(MdmTargetType type, Map<String, Object> values, Ticket ticket) {
        Instant now = clock.instant();
        Set<String> put = new LinkedHashSet<>();
        values.forEach((key, value) -> {
            if (putOne(type, key, value, ticket, now)) {
                put.add(key);
            }
        });
        trimIfOver();
        return put;
    }

    /** 폴링이 받은 변경 하나 — 지우고 지움 기록을 남긴다(같은 키의 기록이 있으면 큰 순번을 지킨다). */
    public synchronized void evict(MdmTargetType type, String key, long seq) {
        maps.get(type).remove(key);
        tombstone(type, key, seq);
    }

    /**
     * 이 인스턴스만 지운다(관리 화면 load). 순번 없는 지움 기록(표지만)을 남겨, 그 전에 Ticket 을 받은 진행 중 적재가 옛 값을 다시 넣지 못하게
     * 한다. 지운 뒤에 받은 Ticket 은 막지 않는다.
     */
    public synchronized void evictLocal(MdmTargetType type, String key) {
        maps.get(type).remove(key);
        tombstone(type, key, Long.MIN_VALUE);
    }

    /** 통째로 비운다(기동·truncated·역행, §5.3). 그 전에 시작한 적재는 넣지 않는다. */
    public synchronized void clear(long newAppliedSeq) {
        maps.values().forEach(Map::clear);
        tombstones.clear();
        generation.incrementAndGet();
        appliedSeq = newAppliedSeq;
    }

    public synchronized void markApplied(long seq) {
        appliedSeq = seq;
        Instant limit = clock.instant().minus(TOMBSTONE_TTL);
        tombstones.values().removeIf(t -> t.at().isBefore(limit));
    }

    public Map<MdmTargetType, Integer> sizes() {
        Map<MdmTargetType, Integer> out = new EnumMap<>(MdmTargetType.class);
        maps.forEach((t, m) -> out.put(t, m.size()));
        return out;
    }

    /**
     * 항목 하나를 읽기만 한다(관리 화면 항목 상세 보기). {@link #get} 과 달리 조회 수를 올리지 않고, 만료 항목도 지우지 않은 채 "없음"(빈 값)으로
     * 답한다 — 캐시 상태(조회 수·지움 기록·세대)를 하나도 바꾸지 않는다. MDM 적재도 하지 않는다.
     */
    public Optional<EntryView> peek(MdmTargetType type, String key) {
        if (type == null || key == null) {
            return Optional.empty();
        }
        Entry e = maps.get(type).get(key);
        Instant now = clock.instant();
        if (e == null || expired(e, now)) {
            return Optional.empty();
        }
        return Optional.of(view(type, key, e, now));
    }

    /** 대상 종류(null 이면 전체)·키 부분 일치(대소문자 무시)로 거른 항목. 종류·키 순. */
    public List<EntryView> entries(MdmTargetType type, String q) {
        Instant now = clock.instant();
        String needle = q == null || q.isBlank() ? null : q.trim().toUpperCase(Locale.ROOT);
        List<EntryView> out = new ArrayList<>();
        for (MdmTargetType t : MdmTargetType.values()) {
            if (type != null && type != t) {
                continue;
            }
            maps.get(t).forEach((k, e) -> {
                if (expired(e, now) || (needle != null && !k.toUpperCase(Locale.ROOT).contains(needle))) {
                    return;
                }
                out.add(view(t, k, e, now));
            });
        }
        out.sort(Comparator.comparing((EntryView v) -> v.type().ordinal()).thenComparing(EntryView::key));
        return out;
    }

    private EntryView view(MdmTargetType type, String key, Entry e, Instant now) {
        long remaining = Math.max(0L, Duration.between(now, e.loadedAt().plus(maxAge)).getSeconds());
        return new EntryView(type, key, e.absent(), e.value(), e.loadedAt(), e.hits(), remaining, e.loadSeq());
    }

    int tombstoneCount() {
        return tombstones.size();
    }

    /** 시험용 — 상한 정리를 실제로 한 횟수. */
    long trimPasses() {
        return trimPasses;
    }

    /** 잠금 안에서 부른다. */
    private boolean putOne(MdmTargetType type, String key, Object value, Ticket ticket, Instant now) {
        if (ticket.generation() != generation.get()) {
            return false;
        }
        Tombstone t = tombstones.get(id(type, key));
        if (t != null && (t.seq() > ticket.appliedSeq() || t.stamp() > ticket.stamp())) {
            return false;
        }
        maps.get(type).put(key, new Entry(value, now, ticket.appliedSeq()));
        return true;
    }

    /** 잠금 안에서 부른다. */
    private void tombstone(MdmTargetType type, String key, long seq) {
        long stamp = stamps.incrementAndGet();
        Instant now = clock.instant();
        tombstones.merge(id(type, key), new Tombstone(seq, now, stamp),
                (old, fresh) -> new Tombstone(Math.max(old.seq(), fresh.seq()), fresh.at(), fresh.stamp()));
    }

    /** 잠금 안에서 부른다. 상한을 넘었으면 한 번에 목표치까지 줄인다 — 만료 항목 먼저, 그다음 적재가 오래된 순. */
    private void trimIfOver() {
        int total = 0;
        for (ConcurrentHashMap<String, Entry> m : maps.values()) {
            total += m.size();
        }
        if (total <= maxEntries) {
            return;
        }
        trimPasses++;
        Instant now = clock.instant();
        record Slot(MdmTargetType type, String key, Entry entry) {
        }
        List<Slot> live = new ArrayList<>();
        for (Map.Entry<MdmTargetType, ConcurrentHashMap<String, Entry>> m : maps.entrySet()) {
            m.getValue().forEach((k, e) -> {
                if (expired(e, now)) {
                    m.getValue().remove(k, e);
                } else {
                    live.add(new Slot(m.getKey(), k, e));
                }
            });
        }
        int over = live.size() - trimTarget;
        if (over <= 0) {
            return;
        }
        live.sort(Comparator.comparing((Slot s) -> s.entry().loadedAt()));
        for (int i = 0; i < over; i++) {
            Slot s = live.get(i);
            maps.get(s.type()).remove(s.key(), s.entry());
        }
    }

    private boolean expired(Entry e, Instant now) {
        return !e.loadedAt().plus(maxAge).isAfter(now);
    }

    private static String id(MdmTargetType type, String key) {
        return type.name() + ':' + key;
    }
}
