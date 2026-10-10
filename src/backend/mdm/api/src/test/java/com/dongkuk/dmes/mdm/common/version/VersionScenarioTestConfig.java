package com.dongkuk.dmes.mdm.common.version;

import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.Events;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.FakeConfirmCheck;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.FakeCurrentUser;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.FakeDraftDeletion;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.FakeStewardDirectory;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.contract.version.VersionConfirmCheckSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionDraftDeletionSpi;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.time.LocalDateTime;
import java.util.EnumSet;
import java.util.List;
import java.util.Set;
import org.springframework.beans.factory.config.BeanFactoryPostProcessor;
import org.springframework.beans.factory.support.BeanDefinitionRegistry;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.objenesis.SpringObjenesis;
import org.springframework.util.ClassUtils;

/**
 * TSK-01-03 design.md §3.2 — 시나리오 테스트용 @Primary 가짜 빈. {@link VersionTableRegistry} 는 넣지 않는다:
 * 픽스처 명세(Oracle) 또는 실제 테이블 명세(TSK-06-01·08-01)를 상속 클래스가 준다.
 *
 * <p>BUSINESS_RULE DRAFT 삭제 훅도 가짜로 둔다 — main 의 실물 {@code RuleDraftDeletionHook}(TSK-08-02) 정의는 아래 후처리기가
 * 이 설정의 컨텍스트에서만 지운다(TSK-08-02 design §7.2). 실물 훅의 CASCADE 는 이 설정을 import 하지 않는 운영 컨텍스트 테스트가 본다.
 */
@TestConfiguration(proxyBeanMethods = false)
public class VersionScenarioTestConfig {

    @Bean
    Events scenarioEvents() {
        return new Events();
    }

    @Bean
    @Primary
    MutableClock scenarioClock() {
        return new MutableClock(MdmClockConfig.KST, LocalDateTime.of(2026, 6, 1, 0, 0, 0));
    }

    @Bean
    @Primary
    FakeCurrentUser scenarioCurrentUser(Events events) {
        return new FakeCurrentUser(events);
    }

    @Bean
    @Primary
    FakeStewardDirectory scenarioStewardDirectory() {
        return new FakeStewardDirectory();
    }

    // 가짜 SPI 빈 이름은 scenario 접두를 붙인다 — 운영 SPI 컴포넌트의 기본 빈 이름(예: masterCodeDraftDeletion)과 겹치면
    // 후처리기가 돌기 전에 정의 중복으로 기동이 실패한다(TSK-06-02 Build 이탈 B1).
    @Bean
    FakeConfirmCheck scenarioMasterCodeConfirmCheck(Events events) {
        return new FakeConfirmCheck(VersionTarget.MASTER_CODE, events);
    }

    @Bean
    FakeConfirmCheck scenarioBusinessRuleConfirmCheck(Events events) {
        return new FakeConfirmCheck(VersionTarget.BUSINESS_RULE, events);
    }

    @Bean
    FakeDraftDeletion scenarioMasterCodeDraftDeletion() {
        return new FakeDraftDeletion(VersionTarget.MASTER_CODE);
    }

    @Bean
    FakeDraftDeletion scenarioBusinessRuleDraftDeletion() {
        return new FakeDraftDeletion(VersionTarget.BUSINESS_RULE);
    }

    /** 이 설정의 가짜 SPI 가 덮는 대상 — 위 {@code scenario*ConfirmCheck}·{@code scenario*DraftDeletion} 빈과 같아야 한다. */
    private static final Set<VersionTarget> FAKED_TARGETS = EnumSet.of(VersionTarget.MASTER_CODE, VersionTarget.BUSINESS_RULE);

    /**
     * TSK-06-02 공용 부품 P2(design.md §10.2, D-076) — 이 설정의 가짜 SPI 와 같은 대상의 운영 SPI 빈 정의를 지운다
     * ({@link VersionSpiRegistry} 는 대상 중복이면 기동 실패). 가짜가 덮는 대상({@link #FAKED_TARGETS})의
     * {@link VersionDraftDeletionSpi}·{@link VersionConfirmCheckSpi} 정의만 지운다. 가짜가 없는 대상(예: ERD_MODEL 의
     * ErdConfirmCheck·ErdDraftDeletion)은 운영 빈을 그대로 둔다 — 그 대상의 서비스가 주입받는다. 대상은 빈을 만들기 전이라
     * 생성자 없이 만든 껍데기 인스턴스의 {@code target()} 으로 읽는다(운영 SPI 의 target() 은 상수를 돌려준다). 이 설정을
     * import 하지 않은 컨텍스트에는 영향이 없다.
     */
    @Bean
    static BeanFactoryPostProcessor removeProductionVersionSpisShadowedByFakes() {
        return beanFactory -> {
            BeanDefinitionRegistry registry = (BeanDefinitionRegistry) beanFactory;
            SpringObjenesis objenesis = new SpringObjenesis();
            for (Class<?> spi : List.of(VersionDraftDeletionSpi.class, VersionConfirmCheckSpi.class)) {
                for (String name : beanFactory.getBeanNamesForType(spi, true, false)) {
                    Class<?> type = beanFactory.getType(name, false);
                    String className = type != null ? type.getName()
                            : beanFactory.getBeanDefinition(name).getBeanClassName();
                    if (className == null || className.startsWith(VersionScenarioFakes.class.getName())) {
                        continue;
                    }
                    if (FAKED_TARGETS.contains(targetOf(objenesis, spi, className))) {
                        registry.removeBeanDefinition(name);
                    }
                }
            }
        };
    }

    private static VersionTarget targetOf(SpringObjenesis objenesis, Class<?> spi, String className) {
        try {
            Object shell = objenesis.newInstance(ClassUtils.forName(className, VersionScenarioTestConfig.class.getClassLoader()));
            return spi == VersionDraftDeletionSpi.class
                    ? ((VersionDraftDeletionSpi) shell).target()
                    : ((VersionConfirmCheckSpi) shell).target();
        } catch (ClassNotFoundException | LinkageError | RuntimeException e) {
            throw new IllegalStateException("운영 SPI 의 대상을 읽지 못했다: " + className, e);
        }
    }
}
