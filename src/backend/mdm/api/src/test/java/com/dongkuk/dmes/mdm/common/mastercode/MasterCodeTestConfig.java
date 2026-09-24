package com.dongkuk.dmes.mdm.common.mastercode;

import com.dongkuk.dmes.mdm.common.support.MdmClockConfig;
import com.dongkuk.dmes.mdm.common.version.VersionScenarioFakes.MutableClock;
import com.dongkuk.dmes.mdm.dma.DmaTestSupport.MutableCurrentUser;
import java.time.LocalDateTime;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;

/**
 * TSK-06-03 design.md §4.3 — 04 표 시험의 가짜 시계·사용자. 시계는 원천 샘플 기준일 2026-09-03 00:00 KST 다(F15:
 * PROC_CD v1.001 의 apply_from 2026-07-01 보다 앞서면 미적용 2개가 되어 MDM007).
 */
@TestConfiguration(proxyBeanMethods = false)
public class MasterCodeTestConfig {

    public static final LocalDateTime SAMPLE_DAY = LocalDateTime.of(2026, 9, 3, 0, 0, 0);

    @Bean
    @Primary
    MutableClock masterCodeClock() {
        return new MutableClock(MdmClockConfig.KST, SAMPLE_DAY);
    }

    @Bean
    @Primary
    MutableCurrentUser masterCodeCurrentUser() {
        return new MutableCurrentUser();
    }
}
