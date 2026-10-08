package com.dongkuk.dmes.cactus.autoconfigure;

import com.dongkuk.dmes.cactus.web.filter.TxIdFilter;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.servlet.FilterRegistrationBean;
import org.springframework.core.Ordered;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link CactusWebSecurityAutoConfiguration} 빈 등록 회귀 테스트.
 *
 * <p>핵심: {@link TxIdFilter} 가 빈 메서드로 정상 등록되고, 보안 필터 체인 바깥 servlet 필터로
 * (Spring Security 필터보다 앞선 순서로) 등록되는지 확인. 나머지 필터는 servlet 자동등록이 차단되어
 * 이중 호출이 일어나지 않아야 한다.
 *
 * <p>풀 ApplicationContext 부팅(HttpSecurity 의존)은 통합 테스트에서 다루고,
 * 본 단위 테스트는 빈 정의 자체의 시그니처/설정을 직접 호출해 검증한다.
 */
class CactusWebSecurityAutoConfigurationTest {

    private final CactusWebSecurityAutoConfiguration autoConfig =
            new CactusWebSecurityAutoConfiguration();

    @Test
    void cactusTxIdFilter_빈_메서드가_TxIdFilter_인스턴스를_생성한다() {
        TxIdFilter filter = autoConfig.cactusTxIdFilter();

        assertThat(filter).isNotNull();
    }

    @Test
    void txIdFilterRegistration_은_보안_체인_바깥_servlet_필터로_등록한다() {
        TxIdFilter filter = autoConfig.cactusTxIdFilter();

        FilterRegistrationBean<TxIdFilter> registration =
                autoConfig.txIdFilterRegistration(filter);

        assertThat(registration.isEnabled()).isTrue();
        assertThat(registration.getFilter()).isSameAs(filter);
        // Spring Security 필터(SecurityProperties.DEFAULT_FILTER_ORDER = -100) 보다 앞
        assertThat(registration.getOrder())
                .isEqualTo(Ordered.HIGHEST_PRECEDENCE + 10)
                .isLessThan(-100);
    }

    @Test
    void 다른_필터의_servlet_자동등록은_계속_차단한다() {
        assertThat(autoConfig.requestIdFilterRegistration(autoConfig.cactusRequestIdFilter()).isEnabled())
                .isFalse();
    }
}
