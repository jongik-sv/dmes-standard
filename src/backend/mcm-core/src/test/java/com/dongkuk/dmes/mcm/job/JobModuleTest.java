package com.dongkuk.dmes.mcm.job;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.springframework.mock.env.MockEnvironment;

class JobModuleTest {

    @Test
    @DisplayName("JobModule.of — 대소문자 무시, 모르는 값은 IllegalArgumentException")
    void moduleOf() {
        assertThat(JobModule.of("mdm")).isEqualTo(JobModule.MDM);
        assertThat(JobModule.of(" MPN ")).isEqualTo(JobModule.MPN);
        assertThatThrownBy(() -> JobModule.of("xyz")).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> JobModule.of(null)).isInstanceOf(IllegalArgumentException.class);
    }

    @Test
    @DisplayName("JobModule.resolve — 설정값 우선, 없으면 spring.application.name 첫 '-' 앞부분")
    void moduleResolve() {
        JobProperties props = new JobProperties();
        assertThat(JobModule.resolve(props, new MockEnvironment().withProperty("spring.application.name", "mdm"))).isEqualTo(JobModule.MDM);
        assertThat(JobModule.resolve(props, new MockEnvironment().withProperty("spring.application.name", "mcm-api"))).isEqualTo(JobModule.MCM);
        props.setModule("mqc");
        assertThat(JobModule.resolve(props, new MockEnvironment().withProperty("spring.application.name", "mdm"))).isEqualTo(JobModule.MQC);

        JobProperties none = new JobProperties();
        assertThat(JobModule.tryResolve(none, new MockEnvironment().withProperty("spring.application.name", "analog"))).isEqualTo(Optional.empty());
        assertThat(JobModule.tryResolve(none, new MockEnvironment())).isEmpty();
        assertThatThrownBy(() -> JobModule.resolve(none, new MockEnvironment().withProperty("spring.application.name", "analog")))
                .isInstanceOf(IllegalStateException.class);
    }
}
