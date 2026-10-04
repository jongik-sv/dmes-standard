package com.dongkuk.dmes.cactus.oasis.provider;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.cactus.oasis.provider.FakeServices.CountingProvider;
import com.dongkuk.oasis.cache.SizeBaseCacheService;
import org.junit.jupiter.api.Test;

/**
 * oasis-core-api {@link SizeBaseCacheService} 를 {@link CactusCachingServiceProvider} 에 끼웠을 때의 실제 동작 기록.
 *
 * <p>cactus 가 이 캐시를 더 쓰지 않게 된 까닭을 남긴다(리팩토링 항목 2). oasis 소스는 고치지 않으므로 이 단언은
 * 교체 전후 모두 통과한다. 원인:
 * <ul>
 *   <li>{@code getObject} 가 미스여도 키를 순서 목록에 넣고, 이어지는 {@code cache} 가 또 넣어 목록에 키가 두 번씩 쌓인다.</li>
 *   <li>상한 확인이 {@code list.size() == size} 라서 목록이 상한을 한 번 넘으면 다시는 내보내지 않는다.</li>
 *   <li>적중 때도 전역 락 아래 {@code LinkedList.remove(key)}(O(n)) 를 하고, {@code data.get} 은 락 밖에서 HashMap 을 읽는다.</li>
 * </ul>
 */
class SizeBaseCacheServiceQuirksTest {

    @Test
    void 상한_1이어도_키_10개가_모두_남는다_상한이_지켜지지_않음() {
        CountingProvider delegate = new CountingProvider();
        CactusCachingServiceProvider provider =
                new CactusCachingServiceProvider(delegate, new SizeBaseCacheService<>(1));

        loadTwice(provider, 10);

        assertThat(delegate.total()).isEqualTo(10);
    }

    @Test
    void 상한_2여도_키_10개가_모두_남는다_상한이_지켜지지_않음() {
        CountingProvider delegate = new CountingProvider();
        CactusCachingServiceProvider provider =
                new CactusCachingServiceProvider(delegate, new SizeBaseCacheService<>(2));

        loadTwice(provider, 10);

        assertThat(delegate.total()).isEqualTo(10);
    }

    @Test
    void 상한_3이면_키_2개만_넣어도_첫_키가_밀려나고_그_뒤로는_상한이_지켜지지_않는다() {
        CountingProvider delegate = new CountingProvider();
        CactusCachingServiceProvider provider =
                new CactusCachingServiceProvider(delegate, new SizeBaseCacheService<>(3));

        loadTwice(provider, 10);

        // 두 번째 순회에서 svc0 하나만 다시 로드된다
        assertThat(delegate.count("svc0")).isEqualTo(2);
        assertThat(delegate.total()).isEqualTo(11);
    }

    @Test
    void 짝수_상한_100_에서는_키_52개가_모두_남는다() {
        CountingProvider delegate = new CountingProvider();
        CactusCachingServiceProvider provider =
                new CactusCachingServiceProvider(delegate, new SizeBaseCacheService<>(100));

        loadTwice(provider, 52);

        assertThat(delegate.total()).isEqualTo(52);
    }

    private static void loadTwice(CactusCachingServiceProvider provider, int keys) {
        for (int pass = 0; pass < 2; pass++) {
            for (int i = 0; i < keys; i++) {
                provider.service("svc" + i);
            }
        }
    }
}
