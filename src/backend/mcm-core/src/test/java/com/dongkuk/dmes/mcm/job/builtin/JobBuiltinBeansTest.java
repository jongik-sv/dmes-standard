package com.dongkuk.dmes.mcm.job.builtin;

import static org.assertj.core.api.Assertions.assertThat;

import com.dongkuk.dmes.mcm.job.agent.JobHandlerRegistry;
import com.dongkuk.dmes.mcm.job.builtin.collect.SqlCollectSource;
import com.dongkuk.oasis.provider.SimpleServiceProvider;
import java.lang.reflect.Method;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.scheduling.annotation.Async;
import org.springframework.transaction.annotation.Transactional;

/** 내장 서비스 빈이 OASIS 에서 부르는 빈이라 프록시를 만드는 어노테이션이 없어야 한다(ParameterName must not be null) + BPMN 3개가 클래스패스에 있다. */
class JobBuiltinBeansTest {

    @Test
    @DisplayName("내장 서비스 클래스에 @Transactional·@Async·@Cacheable 이 없다")
    void noProxyAnnotations() {
        for (Class<?> c : List.of(JobCodeService.class, JobQueryService.class, JobCollectService.class)) {
            assertThat(c.isAnnotationPresent(Transactional.class)).as(c.getSimpleName()).isFalse();
            for (Method m : c.getDeclaredMethods()) {
                assertThat(m.isAnnotationPresent(Transactional.class) || m.isAnnotationPresent(Async.class) || m.isAnnotationPresent(Cacheable.class))
                        .as(c.getSimpleName() + "." + m.getName()).isFalse();
            }
        }
    }

    @Test
    @DisplayName("jobCode·jobQuery·jobCollect BPMN 을 서비스 제공자가 찾는다(mcm-core jar 의 services/job/*)")
    void bpmnFilesAreFound() {
        SimpleServiceProvider provider = new SimpleServiceProvider("/services", "bpmn", "^^");
        for (String id : List.of("jobCode", "jobQuery", "jobCollect")) {
            assertThat(provider.service(id)).as(id).isNotNull();
        }
    }
}
