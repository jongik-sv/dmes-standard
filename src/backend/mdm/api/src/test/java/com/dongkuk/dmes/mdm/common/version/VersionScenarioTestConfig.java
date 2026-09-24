package com.dongkuk.dmes.mdm.common.version;

import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.Events;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.FakeConfirmCheck;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.FakeCurrentUser;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.FakeDraftDeletion;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.FakeStewardDirectory;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.contract.version.VersionTarget;
import java.time.LocalDateTime;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * TSK-01-03 design.md §3.2 — 시나리오 테스트용 @Primary 가짜 빈. {@link VersionTableRegistry} 는 넣지 않는다:
 * 픽스처 명세(SQLite·MSSQL) 또는 실제 테이블 명세(TSK-06-01·08-01)를 상속 클래스가 준다.
 *
 * <p>BUSINESS_RULE DRAFT 삭제 훅 가짜는 두지 않는다 — main 의 실물 {@code RuleDraftDeletionHook}(TSK-08-02)과 같은 대상에 둘이
 * 되면 {@code VersionSpiRegistry} 가 기동을 실패시킨다. TSK-06-02 의 일반형 BeanFactoryPostProcessor 가 들어오면 이 가짜를 되살려도
 * 된다(TSK-08-02 design §7.2).
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

    @Bean
    FakeConfirmCheck masterCodeConfirmCheck(Events events) {
        return new FakeConfirmCheck(VersionTarget.MASTER_CODE, events);
    }

    @Bean
    FakeConfirmCheck businessRuleConfirmCheck(Events events) {
        return new FakeConfirmCheck(VersionTarget.BUSINESS_RULE, events);
    }

    @Bean
    FakeDraftDeletion masterCodeDraftDeletion() {
        return new FakeDraftDeletion(VersionTarget.MASTER_CODE);
    }
}
