package com.dongkuk.dmes.cactus.mdm;

import java.util.ArrayDeque;
import java.util.Collection;
import java.util.Deque;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
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

    FakeMetaFeed() {
        for (MdmTargetType t : MdmTargetType.values()) {
            values.put(t, new ConcurrentHashMap<>());
        }
    }

    FakeMetaFeed put(MdmTargetType type, String key, Object value) {
        values.get(type).put(key, value);
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
        fetchEntered.countDown();
        CountDownLatch gate = fetchGate;
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
        Map<String, Object> found = new LinkedHashMap<>();
        Map<String, String> failed = new LinkedHashMap<>();
        for (String k : keys) {
            if (failedKeys.containsKey(k)) {
                failed.put(k, failedKeys.get(k));
            } else if (values.get(type).containsKey(k)) {
                found.put(k, values.get(type).get(k));
            }
        }
        return new MdmFetchResult(found, failed);
    }
}
