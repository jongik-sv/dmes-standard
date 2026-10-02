package com.dongkuk.dmes.cactus.mdm;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Optional;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicLong;

/**
 * MDM 메타 캐시(spec docs/superpowers/specs/2026-10-02-mdm-meta-cache-design.md §5.2) — 대상 종류별 {@code ConcurrentHashMap}. 항목은 값 또는
 * "없음", 적재 시각, 적재 직전 {@code appliedSeq}, 조회 수를 가진다. 합계가 {@code max-entries} 를 넘으면 적재가 오래된 순으로 지우고,
 * {@code max-age} 가 지난 항목은 조회 때 버린다. Caffeine 을 쓰지 않는다(§5.1).
 *
 * <p>적재와 경합(§5.3-5, Ruling R7): 적재는 시작할 때 {@link Ticket} 을 받는다. 넣을 때 캐시가 통째로 비워졌거나(generation 다름) 그 키가
 * {@code ticket.appliedSeq} 뒤의 변경으로 지워졌으면 넣지 않는다 — 늦게 도착한 옛 값이 남지 않는다. 지움 기록은 5분 뒤 정리한다.
 */
public final class MdmMetaCache {

    static final Duration TOMBSTONE_TTL = Duration.ofMinutes(5);

    private final int maxEntries;
    private final Duration maxAge;
    private final Clock clock;
    private final Map<MdmTargetType, ConcurrentHashMap<String, Entry>> maps = new EnumMap<>(MdmTargetType.class);
    private final ConcurrentHashMap<String, Tombstone> tombstones = new ConcurrentHashMap<>();
    private final AtomicLong generation = new AtomicLong();
    private volatile long appliedSeq = -1L;

    public MdmMetaCache(int maxEntries, Duration maxAge, Clock clock) {
        this.maxEntries = Math.max(1, maxEntries);
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

    /** 적재 시작 때의 캐시 세대와 적용 순번. */
    public record Ticket(long generation, long appliedSeq) {
    }

    /** 관리 화면용 항목 한 줄. */
    public record EntryView(MdmTargetType type, String key, boolean absent, Object value, Instant loadedAt, long hits,
                            long remainingSeconds, long loadSeq) {
    }

    private record Tombstone(long seq, Instant at) {
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

    public Ticket ticket() {
        return new Ticket(generation.get(), appliedSeq);
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
        if (ticket.generation() != generation.get()) {
            return false;
        }
        Tombstone t = tombstones.get(id(type, key));
        if (t != null && t.seq() > ticket.appliedSeq()) {
            return false;
        }
        maps.get(type).put(key, new Entry(value, clock.instant(), ticket.appliedSeq()));
        trim();
        return true;
    }

    /** 폴링이 받은 변경 하나 — 지우고 지움 기록을 남긴다. */
    public synchronized void evict(MdmTargetType type, String key, long seq) {
        maps.get(type).remove(key);
        tombstones.put(id(type, key), new Tombstone(seq, clock.instant()));
    }

    /** 이 인스턴스만 지운다(관리 화면 load). 지움 기록을 남기지 않는다. */
    public void evictLocal(MdmTargetType type, String key) {
        maps.get(type).remove(key);
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
                long remaining = Math.max(0L, Duration.between(now, e.loadedAt().plus(maxAge)).getSeconds());
                out.add(new EntryView(t, k, e.absent(), e.value(), e.loadedAt(), e.hits(), remaining, e.loadSeq()));
            });
        }
        out.sort(Comparator.comparing((EntryView v) -> v.type().ordinal()).thenComparing(EntryView::key));
        return out;
    }

    int tombstoneCount() {
        return tombstones.size();
    }

    private void trim() {
        int over = maps.values().stream().mapToInt(Map::size).sum() - maxEntries;
        if (over <= 0) {
            return;
        }
        record Slot(MdmTargetType type, String key, Instant at) {
        }
        List<Slot> all = new ArrayList<>();
        maps.forEach((t, m) -> m.forEach((k, e) -> all.add(new Slot(t, k, e.loadedAt()))));
        all.sort(Comparator.comparing(Slot::at));
        for (int i = 0; i < over && i < all.size(); i++) {
            maps.get(all.get(i).type()).remove(all.get(i).key());
        }
    }

    private boolean expired(Entry e, Instant now) {
        return !e.loadedAt().plus(maxAge).isAfter(now);
    }

    private static String id(MdmTargetType type, String key) {
        return type.name() + ':' + key;
    }
}
