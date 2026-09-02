package com.dongkuk.dmes.cactus.autoconfigure;

import com.dongkuk.dmes.cactus.web.filter.TxIdFilter;
import org.junit.jupiter.api.Test;
import org.springframework.boot.web.servlet.FilterRegistrationBean;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * {@link CactusWebSecurityAutoConfiguration} 빈 등록 회귀 테스트.
 *
 * <p>핵심: {@link TxIdFilter} 가 빈 메서드로 정상 등록되고 servlet 자동등록(FilterRegistrationBean) 이
 * 차단되어 이중 호출이 일어나지 않는지 확인.
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
    void txIdFilterRegistration_은_servlet_자동등록을_차단한다() {
        TxIdFilter filter = autoConfig.cactusTxIdFilter();

        FilterRegistrationBean<TxIdFilter> registration =
                autoConfig.txIdFilterRegistration(filter);

        assertThat(registration.isEnabled()).isFalse();
        assertThat(registration.getFilter()).isSameAs(filter);
    }
}
