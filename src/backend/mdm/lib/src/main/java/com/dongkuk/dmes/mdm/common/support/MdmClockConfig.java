package com.dongkuk.dmes.mdm.common.support;

import java.time.Clock;
import java.time.ZoneId;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

/**
 * mdm 애플리케이션 시각(TSK-01-03 B1). 규칙표 #16: 현재 시각은 애플리케이션이 KST 로 구해 파라미터로 넘기고
 * DB 시각 함수를 쓰지 않는다. 서비스는 {@link Clock} 을 타입으로 주입받는다(테스트는 @Primary 로 바꾼다).
 */
@Configuration
public class MdmClockConfig {

    public static final ZoneId KST = ZoneId.of("Asia/Seoul");

    @Bean
    public Clock mdmClock() {
        return Clock.system(KST);
    }
}
