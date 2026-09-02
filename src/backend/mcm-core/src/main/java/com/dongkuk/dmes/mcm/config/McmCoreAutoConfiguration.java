package com.dongkuk.dmes.mcm.config;

import com.dongkuk.dmes.mcm.security.password.McmPasswordProperties;
import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.scheduling.annotation.EnableAsync;
import org.springframework.scheduling.annotation.EnableScheduling;

/**
 * mcm-core 자동 설정.
 *
 * <p>본 설정은 mcm-core 의 인프라성 기능만 활성화한다 — {@link McmPasswordProperties}
 * binding, {@link EnableScheduling @EnableScheduling}, {@link EnableAsync @EnableAsync}.
 * service/repository 빈의 component scan 은 사이트 책임이다 — 사이트의
 * {@code @SpringBootApplication(scanBasePackages = ...)} 또는 {@code @EnableJpaRepositories}
 * 에 {@code com.dongkuk.dmes.mcm} 을 포함시키면 RBAC/사용자관리/메뉴 등 mcm-core 빈이
 * 활성화된다.
 *
 * <p>이 정책의 이유: mcm-core 의 RBAC/사용자관리 빈들은 사이트가 등록해야 하는 SPI
 * 어댑터(PasswordHasher, UserAccountRepository, SecurityIdentity)에 의존한다. mcm-core 가
 * 모든 사이트에서 자동 component scan 으로 등록을 시도하면, 어댑터가 없는 사이트
 * (mpn/mpp/mqc 등 mcm-core 를 라이브러리로만 참조하는 사이트)는 부팅 시 의존성 누락으로
 * 실패한다. 사이트가 의도해서 scan 에 포함했을 때만 활성화하는 게 안전하다.
 *
 * <p>본 설정은 cactus-core / oasis-core 의존이 0건이며, 그 빈들은 사이트 책임이다.
 *
 * <p>사이트가 default 빈을 override 하려면 {@code @Primary} 또는 같은 이름의 빈으로
 * 등록한다.
 */
@AutoConfiguration
@EnableConfigurationProperties(McmPasswordProperties.class)
@EnableScheduling
@EnableAsync
public class McmCoreAutoConfiguration {
}
