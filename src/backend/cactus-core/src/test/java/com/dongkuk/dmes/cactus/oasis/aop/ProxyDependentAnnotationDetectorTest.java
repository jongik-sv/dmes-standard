package com.dongkuk.dmes.cactus.oasis.aop;

import static org.assertj.core.api.Assertions.assertThat;

import java.lang.annotation.ElementType;
import java.lang.annotation.Retention;
import java.lang.annotation.RetentionPolicy;
import java.lang.annotation.Target;
import java.util.List;
import org.aopalliance.intercept.MethodInterceptor;
import org.junit.jupiter.api.Test;
import org.springframework.aop.framework.ProxyFactory;
import org.springframework.cache.annotation.Cacheable;
import org.springframework.scheduling.annotation.Async;
import org.springframework.security.access.prepost.PreAuthorize;
import org.springframework.transaction.annotation.Transactional;

/**
 * {@link ProxyDependentAnnotationDetector} — 클래스 레벨·메서드 레벨·메타 어노테이션을 모두 잡고,
 * 프록시 클래스를 받아도 원본 클래스 기준으로 본다.
 */
class ProxyDependentAnnotationDetectorTest {

    private final ProxyDependentAnnotationDetector detector = new ProxyDependentAnnotationDetector();

    @Retention(RetentionPolicy.RUNTIME)
    @Target({ElementType.TYPE, ElementType.METHOD})
    @Transactional
    public @interface BpmnTx {
    }

    @Transactional(readOnly = true)
    public static class ClassLevel {
        public void search() {
        }
    }

    public static class MethodLevel {
        @Cacheable("codes")
        public String find() {
            return "x";
        }

        @PreAuthorize("hasRole('ADMIN')")
        public void secure() {
        }

        public void plain() {
        }
    }

    @BpmnTx
    public static class MetaOnClass {
    }

    public static class MetaOnMethod {
        @BpmnTx
        public void run() {
        }
    }

    public interface AsyncApi {
        @Async
        void fire();
    }

    public static class ViaInterface implements AsyncApi {
        @Override
        public void fire() {
        }
    }

    public static class Clean {
        public void run() {
        }
    }

    @Test
    void 클래스_레벨_어노테이션을_찾는다() {
        List<ProxyDependentAnnotationDetector.Finding> findings = detector.detect(ClassLevel.class);

        assertThat(findings).extracting(Object::toString).containsExactly("@Transactional(클래스)");
        assertThat(findings.get(0).category()).isEqualTo("트랜잭션");
    }

    @Test
    void 메서드_레벨_어노테이션을_메서드_이름과_함께_찾는다() {
        assertThat(detector.detect(MethodLevel.class)).extracting(Object::toString)
                .containsExactlyInAnyOrder("@Cacheable(메서드 find)", "@PreAuthorize(메서드 secure)");
    }

    @Test
    void 메타_어노테이션으로_붙은_Transactional_도_찾는다() {
        assertThat(detector.detect(MetaOnClass.class)).extracting(Object::toString)
                .containsExactly("@Transactional(클래스)");
        assertThat(detector.detect(MetaOnMethod.class)).extracting(Object::toString)
                .containsExactly("@Transactional(메서드 run)");
    }

    @Test
    void 인터페이스_메서드에_붙은_어노테이션도_찾는다() {
        assertThat(detector.detect(ViaInterface.class)).extracting(Object::toString)
                .containsExactly("@Async(메서드 fire)");
    }

    @Test
    void 어노테이션이_없으면_빈_목록이다() {
        assertThat(detector.detect(Clean.class)).isEmpty();
        assertThat(detector.detect(null)).isEmpty();
    }

    @Test
    void CGLIB_프록시_클래스를_받아도_원본_클래스로_본다() {
        ProxyFactory pf = new ProxyFactory(new ClassLevel());
        pf.setProxyTargetClass(true);
        pf.addAdvice((MethodInterceptor) inv -> inv.proceed());
        Object proxy = pf.getProxy();

        assertThat(proxy.getClass()).isNotEqualTo(ClassLevel.class);
        assertThat(detector.detect(proxy.getClass())).extracting(Object::toString)
                .containsExactly("@Transactional(클래스)");
    }

    @Test
    void 대안_안내는_분류별로_한_번씩_적는다() {
        String alt = ProxyDependentAnnotationDetector.alternatives(detector.detect(MethodLevel.class));

        assertThat(alt).contains("캐시: ").contains("보안: ");
        assertThat(alt.indexOf("캐시: ")).isEqualTo(alt.lastIndexOf("캐시: "));
    }
}
