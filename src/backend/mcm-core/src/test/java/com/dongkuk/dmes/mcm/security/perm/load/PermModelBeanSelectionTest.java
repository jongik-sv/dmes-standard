package com.dongkuk.dmes.mcm.security.perm.load;

import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;
import org.springframework.context.annotation.AnnotationConfigApplicationContext;
import org.springframework.mock.env.MockEnvironment;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * perm-bench r2 — {@code mcm.security.perm-model} 값마다 PermGraphLoader 빈이 하나만 등록되는지 본다(DB 없음, 등록 단계만).
 *
 * <p>작성자: @jongik-sv
 * <p>작성일: 2026-11-27
 */
class PermModelBeanSelectionTest {

    @ParameterizedTest(name = "perm-model={0} → {1}")
    @DisplayName("속성 값 → 등록되는 로더(값은 대소문자를 가리지 않는다 — ConditionalOnProperty 규칙)")
    @CsvSource({"'',v2PermGraphLoader", "v2,v2PermGraphLoader", "legacy,legacyPermGraphLoader", "Legacy,legacyPermGraphLoader"})
    void oneLoader(String model, String expected) {
        MockEnvironment env = new MockEnvironment();
        if (model != null && !model.isEmpty()) env.setProperty("mcm.security.perm-model", model);
        try (AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext()) {
            ctx.setEnvironment(env);
            ctx.register(V2PermGraphLoader.class, LegacyPermGraphLoader.class);
            assertThat(ctx.getBeanDefinitionNames()).filteredOn(n -> n.endsWith("PermGraphLoader")).containsExactly(expected);
        }
    }

    @ParameterizedTest
    @DisplayName("모르는 값 = 로더 없음(기동 실패로 드러난다)")
    @CsvSource({"V2X", "old"})
    void unknown(String model) {
        MockEnvironment env = new MockEnvironment().withProperty("mcm.security.perm-model", model);
        try (AnnotationConfigApplicationContext ctx = new AnnotationConfigApplicationContext()) {
            ctx.setEnvironment(env);
            ctx.register(V2PermGraphLoader.class, LegacyPermGraphLoader.class);
            assertThat(ctx.getBeanDefinitionNames()).filteredOn(n -> n.endsWith("PermGraphLoader")).isEmpty();
        }
    }
}
