package com.dongkuk.dmes.cactus.scheduling;

import org.springframework.boot.autoconfigure.AutoConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.scheduling.TaskScheduler;
import org.springframework.scheduling.annotation.SchedulingConfigurer;

/**
 * {@code @Scheduled} 실행이 쓰는 {@link TaskScheduler} 를 {@link JobLoggingTaskScheduler} 로 감싸
 * 모든 예약 작업 로그에 service_tag·serviceId 가 찍히게 한다. 작업마다 코드를 고치지 않는다.
 *
 * <p>스프링 7 은 {@code @Scheduled} 용 레지스트리에 스케줄러 라우터를 미리 넣고, 라우터가 작업마다
 * 알맞은 스케줄러 빈({@code @Scheduled(scheduler=...)} 포함)을 고른다. 그 라우터를 감싸므로
 * 어느 스케줄러로 가든 같은 태그가 붙는다. {@code @EnableScheduling} 이 없는 모듈에서는 이 configurer 가
 * 불리지 않아 아무 일도 하지 않는다. 모듈이 자체 실행기를 쓰면(예: MdmRevisionPoller) 직접
 * {@link ScheduledJobLogContext} 로 감싼다.
 */
@AutoConfiguration
public class ScheduledJobLogAutoConfiguration {

    @Bean
    SchedulingConfigurer scheduledJobLogConfigurer() {
        return registrar -> {
            TaskScheduler scheduler = registrar.getScheduler();
            if (scheduler != null && !(scheduler instanceof JobLoggingTaskScheduler)) {
                registrar.setTaskScheduler(new JobLoggingTaskScheduler(scheduler));
            }
        };
    }
}
