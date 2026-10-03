package com.dongkuk.dmes.cactus.mdm;

import java.time.LocalDateTime;
import java.util.ArrayDeque;
import java.util.Collection;
import java.util.Deque;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

/** 시험용 피드 — 값·실패·변경 응답을 손으로 정하고 호출을 센다. */
final class FakeMetaFeed implements MdmMetaFeed {

    final Map<MdmTargetType, Map<String, Object>> values = new EnumMap<>(MdmTargetType.class);
    final Map<String, String> failedKeys = new ConcurrentHashMap<>();
    final AtomicInteger fetchCalls = new AtomicInteger();
    final List<List<String>> fetchedKeys = new CopyOnWriteArrayList<>();
    /** {@link MdmChanges} 또는 던질 {@link RuntimeException} 을 차례로. */
    final Deque<Object> changes = new ArrayDeque<>();
    final List<Long> changesSince = new CopyOnWriteArrayList<>();
    final CountDownLatch fetchEntered = new CountDownLatch(1);
    volatile RuntimeException fetchError;
    /** null 이 아니면 fetch 가 이 래치가 풀릴 때까지(최대 5초) 기다린다. */
    volatile CountDownLatch fetchGate;
    /** 참이면 새 MDM 처럼 part 를 안다(fetchToc·fetchBodies 를 직접 답한다). 거짓이면 옛 MDM — default 메서드가 fetch 를 부른다. */
    volatile boolean versioned;
    /** 목차 응답에서 current 를 빼는가(본문 요청 경로를 강제한다). */
    volatile boolean omitCurrent;
    final AtomicInteger tocCalls = new AtomicInteger();
    final AtomicInteger bodyCalls = new AtomicInteger();
    final List<List<String>> tocKeys = new CopyOnWriteArrayList<>();
    final List<LocalDateTime> tocAts = new CopyOnWriteArrayList<>();
    final List<List<MdmBodyKey>> bodyKeys = new CopyOnWriteArrayList<>();
    /** 다음 본문 요청에서 한 번 NOT_RELEASED 로 답할 쌍 — 목차가 낡은 상황. */
    final Set<MdmBodyKey> notReleasedOnce = ConcurrentHashMap.newKeySet();
    /** 늘 NOT_RELEASED 로 답할 쌍. */
    final Set<MdmBodyKey> notReleasedAlways = ConcurrentHashMap.newKeySet();
    /** 본문 요청에서 이 메시지로 failed 를 줄 쌍(목차·current 는 그대로) — 그 버전 본문만 받을 수 없는 상황. */
    final Map<MdmBodyKey, String> failedBodies = new ConcurrentHashMap<>();

    FakeMetaFeed() {
        for (MdmTargetType t : MdmTargetType.values()) {
            values.put(t, new ConcurrentHashMap<>());
        }
    }

    FakeMetaFeed put(MdmTargetType type, String key, Object value) {
        values.get(type).put(key, value);
        return this;
    }

    FakeMetaFeed versioned() {
        this.versioned = true;
        return this;
    }

    @Override
    public synchronized MdmChanges changes(long since, int limit) {
        changesSince.add(since);
        Object next = changes.poll();
        if (next instanceof RuntimeException e) {
            throw e;
        }
        if (next == null) {
            throw new MdmUnavailableException("준비된 변경 응답이 없다");
        }
        return (MdmChanges) next;
    }

    @Override
    public MdmFetchResult fetch(MdmTargetType type, Collection<String> keys) {
        fetchCalls.incrementAndGet();
        fetchedKeys.add(List.copyOf(keys));
        // MDM 이 값을 읽은 시점 = 호출 시점. 문(gate)에서 기다리는 동안 바뀐 값은 이 응답에 들어가지 않는다(늦게 도착한 옛 값 재현).
        Map<String, Object> found = new LinkedHashMap<>();
        Map<String, String> failed = new LinkedHashMap<>();
        for (String k : keys) {
            if (failedKeys.containsKey(k)) {
                failed.put(k, failedKeys.get(k));
            } else if (values.get(type).containsKey(k)) {
                found.put(k, values.get(type).get(k));
            }
        }
        enterAndMaybeFail();
        return new MdmFetchResult(found, failed);
    }

    @Override
    public MdmTocResult fetchToc(MdmTargetType type, Collection<String> keys, LocalDateTime at) {
        if (!versioned) {
            return MdmMetaFeed.super.fetchToc(type, keys, at);
        }
        tocCalls.incrementAndGet();
        tocKeys.add(List.copyOf(keys));
        tocAts.add(at);
        Map<String, MdmToc> tocs = new LinkedHashMap<>();
        Map<String, MdmCurrent> current = new LinkedHashMap<>();
        Map<String, String> failed = new LinkedHashMap<>();
        for (String k : keys) {
            if (failedKeys.containsKey(k)) {
                failed.put(k, failedKeys.get(k));
                continue;
            }
            Object full = values.get(type).get(k);
            if (full == null) {
                continue;
            }
            MdmToc toc = MdmLegacyValues.toc(type, full);
            tocs.put(k, toc);
            if (at != null && !omitCurrent) {
                MdmVersionSelector.select(type, toc, at)
                        .flatMap(v -> MdmLegacyValues.rawBody(type, full, v).map(b -> new MdmCurrent(v, b)))
                        .ifPresent(c -> current.put(k, c));
            }
        }
        enterAndMaybeFail();
        return new MdmTocResult(tocs, current, Map.of(), failed);
    }

    @Override
    public MdmBodyResult fetchBodies(MdmTargetType type, Collection<MdmBodyKey> keys) {
        if (!versioned) {
            return MdmMetaFeed.super.fetchBodies(type, keys);
        }
        bodyCalls.incrementAndGet();
        bodyKeys.add(List.copyOf(keys));
        Map<MdmBodyKey, Object> found = new LinkedHashMap<>();
        Map<MdmBodyKey, String> failed = new LinkedHashMap<>();
        for (MdmBodyKey k : keys) {
            if (notReleasedOnce.remove(k) || notReleasedAlways.contains(k)) {
                failed.put(k, "NOT_RELEASED");
                continue;
            }
            if (failedKeys.containsKey(k.key())) {
                failed.put(k, failedKeys.get(k.key()));
                continue;
            }
            if (failedBodies.containsKey(k)) {
                failed.put(k, failedBodies.get(k));
                continue;
            }
            Object full = values.get(type).get(k.key());
            Optional<Object> body = full == null ? Optional.empty() : MdmLegacyValues.rawBody(type, full, k.ver());
            if (body.isPresent()) {
                found.put(k, body.get());
            } else {
                failed.put(k, "NOT_RELEASED");
            }
        }
        enterAndMaybeFail();
        return new MdmBodyResult(found, failed, Map.of(), Map.of(), Set.of());
    }

    /**
     * MDM 이 값을 읽은 시점 = 호출 시점. 문(gate)에서 기다리는 동안 바뀐 값은 이 응답에 들어가지 않는다(늦게 도착한 옛 값 재현). gate 는 들어왔다고
     * 알리기 전에 읽는다 — 시험이 알림을 받고 fetchGate 를 바꿔도 이 호출은 기다린다.
     */
    private void enterAndMaybeFail() {
        CountDownLatch gate = fetchGate;
        fetchEntered.countDown();
        if (gate != null) {
            try {
                gate.await(5, TimeUnit.SECONDS);
            } catch (InterruptedException e) {
                Thread.currentThread().interrupt();
            }
        }
        RuntimeException error = fetchError;
        if (error != null) {
            throw error;
        }
    }
}
