package com.dongkuk.dmes.mdm.common.embedding;

import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import org.junit.jupiter.api.Assertions;
import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;

/**
 * TSK-04-02 design.md §3.2 — I12, I13. {@code lib} 은 {@code @SpringBootApplication}·Flyway 리소스가
 * 없어 {@code @SpringBootTest} 컨텍스트를 못 띄운다(TSK-04-01 F6) — {@code ApplicationContextRunner} 로
 * 임베딩 설정 클래스만 올려서 확인한다. DB 불필요.
 *
 * <p>{@code withUserConfiguration} 에 실제 구현 클래스(둘 다 {@code @Component}+
 * {@code @ConditionalOnProperty})를 그대로 등록한다 — 수동으로 빈을 새로 만들지 않는다. 조건 애노테이션은
 * 자동설정 클래스가 아니어도 스프링 컨텍스트 refresh 과정에서 그대로 평가되므로, 프로퍼티 값에 따라
 * 실제로 어느 빈이 뜨는지(그리고 뜨지 않는지) 이 러너로 검증할 수 있다.
 */
class NoopTermEmbeddingEncoderTest {

    private final ApplicationContextRunner runner = new ApplicationContextRunner()
            .withUserConfiguration(NoopTermEmbeddingEncoder.class, DeterministicHashTermEmbeddingEncoder.class);

    @Test
    void 프로퍼티_오버라이드가_없으면_Noop_빈만_뜬다() {
        runner.run(context -> {
            assertTrue(context.getBeansOfType(NoopTermEmbeddingEncoder.class).size() == 1,
                    "matchIfMissing=true 이므로 Noop 이 떠야 한다");
            assertTrue(context.getBeansOfType(DeterministicHashTermEmbeddingEncoder.class).isEmpty(),
                    "프로퍼티 없이는 fake 인코더가 뜨면 안 된다(I13, 운영 기본이 fake 로 새는 사고 방지)");
        });
    }

    @Test
    void encoder_none_이면_Noop_빈만_뜬다() {
        runner.withPropertyValues("mdm.embedding.encoder=none").run(context -> {
            assertTrue(context.getBeansOfType(NoopTermEmbeddingEncoder.class).size() == 1);
            assertTrue(context.getBeansOfType(DeterministicHashTermEmbeddingEncoder.class).isEmpty());
        });
    }

    @Test
    void encoder_fake_면_DeterministicHash_빈만_뜬다() {
        runner.withPropertyValues("mdm.embedding.encoder=fake").run(context -> {
            assertTrue(context.getBeansOfType(DeterministicHashTermEmbeddingEncoder.class).size() == 1);
            assertTrue(context.getBeansOfType(NoopTermEmbeddingEncoder.class).isEmpty(),
                    "fake 활성 시 Noop 은 뜨면 안 된다");
        });
    }

    @Test
    void Noop_은_비활성이고_encode_modelId_는_방어적으로_예외를_던진다() {
        NoopTermEmbeddingEncoder noop = new NoopTermEmbeddingEncoder();
        assertFalse(noop.isEnabled());
        assertThrows(UnsupportedOperationException.class, () -> noop.encode("x"));
        assertThrows(UnsupportedOperationException.class, noop::modelId);
    }

    /**
     * I13 — main {@code application.yml} 자체를 직접 읽어 {@code mdm.embedding.encoder: none} 이
     * 실제로 박혀 있는지 확인한다(advisor 지적 — {@code ApplicationContextRunner} 는 이 yml 을 절대
     * 읽지 않으므로, 이 yml 에 {@code fake} 를 적어 넣는 변이를 이 파일 없이는 못 잡는다). 이 클래스는
     * {@code lib} 모듈이라 {@code api/src/main/resources} 를 상대 경로로 직접 읽는다.
     */
    @Test
    void main_application_yml_의_운영_기본값은_none_이다() throws Exception {
        Path ymlPath = Path.of("../api/src/main/resources/application.yml");
        assertFalse(Files.notExists(ymlPath), ymlPath.toAbsolutePath() + " 이 없다");
        String content = Files.readString(ymlPath);
        // 느슨한 텍스트 검사(YAML 파서 의존 없이) — "encoder:" 다음 값이 none 인지 확인한다.
        Matcher m = Pattern.compile("encoder:\\s*(\\S+)").matcher(content);
        Assertions.assertTrue(m.find(), "encoder: 설정을 찾지 못했다");
        Assertions.assertEquals("none", m.group(1));
    }
}
