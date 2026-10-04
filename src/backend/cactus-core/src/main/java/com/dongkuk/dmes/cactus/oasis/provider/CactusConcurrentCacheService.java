package com.dongkuk.dmes.cactus.oasis.provider;

import com.dongkuk.oasis.cache.CacheService;

import java.util.ArrayDeque;
import java.util.concurrent.ConcurrentHashMap;

/**
 * 읽기에 락이 없는 크기 제한 캐시 — oasis-core-api {@code SizeBaseCacheService} 대체(리팩토링 항목 2).
 *
 * <p>{@code SizeBaseCacheService} 의 문제:
 * <ul>
 *   <li>적중 때도 전역 락 아래 {@code LinkedList.remove(key)}(O(n)) 를 해서 OASIS 호출마다 모든 스레드가 한 줄로 선다.</li>
 *   <li>{@code getObject} 는 객체 락, {@code cache}·{@code evict} 는 {@code this} 락 — 서로 다른 락이라
 *       락 밖에서 읽는 {@code HashMap} 과 쓰기가 겹친다.</li>
 *   <li>미스 때마다 키가 순서 목록에 두 번 들어가고 상한 확인이 {@code ==} 라서 상한이 사실상 지켜지지 않는다
 *       ({@code SizeBaseCacheServiceQuirksTest}).</li>
 * </ul>
 *
 * <p>동작:
 * <ul>
 *   <li><b>읽기</b> — {@link #getObject} 는 {@link ConcurrentHashMap#get} 한 번이다. 락도 쓰기도 없다.</li>
 *   <li><b>쓰기</b> — {@link #cache}·{@link #evict} 는 한 락({@code writeLock}) 아래에서 값 맵과 넣은 순서 큐를 함께 바꾼다.
 *       BPMN 캐시는 서비스마다 처음 한 번만 쓰므로 쓰기 락 경합은 무시할 만하다.</li>
 *   <li><b>상한·내보내기 정책</b> — 넣은 순서(FIFO). 새 키를 넣어 개수가 {@code maxSize} 를 넘으면 가장 먼저 넣은 키부터
 *       내보낸다. 적중은 순서를 바꾸지 않는다(LRU 아님) — 적중 경로를 쓰기 없이 두려는 선택이다. 이미 있는 키를 다시
 *       넣으면 값만 바꾸고 순서는 그대로다. 운영 BPMN 수(mcm 35개, mdm 52개)가 기본 상한 100 보다 작아 내보내기는
 *       보통 일어나지 않으며, 상한은 잘못된 serviceId 로 키가 끝없이 늘지 않게 막는 안전판이다.</li>
 *   <li><b>null</b> — 키가 null 이면 {@link #getObject} 는 null, {@link #cache} 는 {@link NullPointerException}.
 *       값이 null 이면 {@link #cache} 는 그 키를 지운다 — {@code SizeBaseCacheService} 에서도 null 값은 다음 조회가
 *       미스였으므로 같은 결과다.</li>
 * </ul>
 *
 * <p>스레드 안전. 같은 키를 동시에 처음 조회할 때 로드를 한 번으로 묶는 일은 이 캐시가 아니라
 * {@link CactusCachingServiceProvider} 가 맡는다.
 *
 * @param <K> 키
 * @param <V> 값
 */
public class CactusConcurrentCacheService<K, V> implements CacheService<K, V> {

    private final int maxSize;
    private final ConcurrentHashMap<K, V> data;
    /** 넣은 순서. {@code writeLock} 아래에서만 읽고 쓴다. */
    private final ArrayDeque<K> insertionOrder = new ArrayDeque<>();
    private final Object writeLock = new Object();

    /**
     * @param maxSize 최대 항목 수, 1 이상
     * @throws IllegalArgumentException maxSize 가 1 보다 작을 때
     */
    public CactusConcurrentCacheService(int maxSize) {
        if (maxSize < 1) {
            throw new IllegalArgumentException("cache size 는 1 이상이어야 합니다: " + maxSize);
        }
        this.maxSize = maxSize;
        this.data = new ConcurrentHashMap<>(Math.min(maxSize, 256));
    }

    @Override
    public V getObject(K key) {
        if (key == null) {
            return null;
        }
        return data.get(key);
    }

    @Override
    public void cache(K key, V value) {
        if (key == null) {
            throw new NullPointerException("key null");
        }
        synchronized (writeLock) {
            if (value == null) {
                if (data.remove(key) != null) {
                    insertionOrder.remove(key);
                }
                return;
            }
            if (data.containsKey(key)) {
                data.put(key, value);   // 값만 바꾸고 순서는 그대로
                return;
            }
            // 넣기 전에 먼저 내보내 락 밖에서 읽는 쪽도 maxSize 를 넘는 순간을 보지 않게 한다
            while (data.size() >= maxSize) {
                K oldest = insertionOrder.pollFirst();
                if (oldest == null) {
                    break;
                }
                data.remove(oldest);
            }
            data.put(key, value);
            insertionOrder.addLast(key);
        }
    }

    @Override
    public void evict() {
        synchronized (writeLock) {
            data.clear();
            insertionOrder.clear();
        }
    }

    /** 지금 캐시된 항목 수(진단·테스트용). */
    public int size() {
        return data.size();
    }

    /** 최대 항목 수. */
    public int maxSize() {
        return maxSize;
    }
}
