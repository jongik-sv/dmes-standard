package com.dongkuk.dmes.cactus.oasis.aop;

import org.springframework.core.annotation.AnnotatedElementUtils;
import org.springframework.util.ClassUtils;
import org.springframework.util.ReflectionUtils;

import java.lang.annotation.Annotation;
import java.lang.reflect.Method;
import java.util.ArrayList;
import java.util.Collections;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * Spring AOP 프록시가 있어야만 동작하는 어노테이션을 클래스에서 찾는다.
 *
 * <p>BPMN 이 부르는 빈에 붙은 이 어노테이션들은 OASIS 서비스 태스크 경로에서 기대대로 동작하지 않는다
 * (자세한 이유는 {@link OasisAopAnnotationChecker}).
 *
 * <p>클래스 레벨·메서드 레벨·메타 어노테이션(예: {@code @Transactional} 을 품은 사용자 어노테이션)을 모두 잡는다.
 * 탐지는 {@link AnnotatedElementUtils#hasAnnotation} 의 find 의미(상위 클래스·인터페이스 포함)를 따른다.
 *
 * <p>대상 어노테이션은 클래스 이름으로 적어 두고 classpath 에 있는 것만 검사한다.
 * 모듈마다 spring-tx·spring-security·spring-retry 유무가 다르기 때문이다.
 * {@code @Scheduled} 는 프록시가 아니라 원본 빈에 대해 등록되므로 대상이 아니다.
 */
public final class ProxyDependentAnnotationDetector {

    /** 어노테이션 클래스 이름 → 분류 (경고 문구의 대안 안내 키) */
    private static final Map<String, String> TARGETS = new LinkedHashMap<>();

    /** 분류 → 대안 안내 */
    private static final Map<String, String> ALTERNATIVES = new LinkedHashMap<>();

    static {
        TARGETS.put("org.springframework.transaction.annotation.Transactional", "트랜잭션");
        TARGETS.put("jakarta.transaction.Transactional", "트랜잭션");
        TARGETS.put("org.springframework.cache.annotation.Cacheable", "캐시");
        TARGETS.put("org.springframework.cache.annotation.CacheEvict", "캐시");
        TARGETS.put("org.springframework.cache.annotation.CachePut", "캐시");
        TARGETS.put("org.springframework.cache.annotation.Caching", "캐시");
        TARGETS.put("org.springframework.security.access.prepost.PreAuthorize", "보안");
        TARGETS.put("org.springframework.security.access.prepost.PostAuthorize", "보안");
        TARGETS.put("org.springframework.security.access.prepost.PreFilter", "보안");
        TARGETS.put("org.springframework.security.access.prepost.PostFilter", "보안");
        TARGETS.put("org.springframework.security.access.annotation.Secured", "보안");
        TARGETS.put("jakarta.annotation.security.RolesAllowed", "보안");
        TARGETS.put("org.springframework.scheduling.annotation.Async", "비동기");
        TARGETS.put("org.springframework.retry.annotation.Retryable", "재시도");
        TARGETS.put("org.springframework.resilience.annotation.Retryable", "재시도");
        TARGETS.put("org.springframework.resilience.annotation.ConcurrencyLimit", "재시도");
        TARGETS.put("org.springframework.validation.annotation.Validated", "검증");

        ALTERNATIVES.put("트랜잭션", "BPMN 에 트랜잭션 매니저를 선언해 OASIS 프로세스 트랜잭션으로 감싸거나, 메서드 안에서 TransactionTemplate 을 쓴다");
        ALTERNATIVES.put("캐시", "캐시는 별도 빈(Provider·Repository 등)의 메서드로 옮겨 그 빈을 주입받아 부른다");
        ALTERNATIVES.put("보안", "권한은 컨트롤러·URL(메뉴 권한) 단계에서 판정한다");
        ALTERNATIVES.put("비동기", "별도 빈으로 옮기거나 TaskExecutor 에 직접 제출한다");
        ALTERNATIVES.put("재시도", "메서드 안에서 RetryTemplate 등으로 직접 재시도·동시성 제한을 건다");
        ALTERNATIVES.put("검증", "메서드 안에서 Validator 를 직접 부른다");
    }

    /** classpath 에 실제로 있는 대상 어노테이션 */
    private final Map<Class<? extends Annotation>, String> available;

    /** 현재 classpath 기준 탐지기를 만든다 */
    public ProxyDependentAnnotationDetector() {
        this(ProxyDependentAnnotationDetector.class.getClassLoader());
    }

    /**
     * @param classLoader 대상 어노테이션을 찾을 클래스 로더
     */
    @SuppressWarnings("unchecked")
    public ProxyDependentAnnotationDetector(ClassLoader classLoader) {
        Map<Class<? extends Annotation>, String> found = new LinkedHashMap<>();
        for (Map.Entry<String, String> e : TARGETS.entrySet()) {
            if (ClassUtils.isPresent(e.getKey(), classLoader)) {
                Class<?> type = ClassUtils.resolveClassName(e.getKey(), classLoader);
                if (type.isAnnotation()) {
                    found.put((Class<? extends Annotation>) type, e.getValue());
                }
            }
        }
        this.available = Collections.unmodifiableMap(found);
    }

    /**
     * 클래스와 그 메서드에서 프록시 의존 어노테이션을 찾는다.
     *
     * @param type 원본 클래스 (프록시 클래스면 {@link ClassUtils#getUserClass} 로 원본을 쓴다)
     * @return 찾은 항목. 없으면 빈 목록
     */
    public List<Finding> detect(Class<?> type) {
        if (type == null) {
            return List.of();
        }
        Class<?> userClass = ClassUtils.getUserClass(type);
        List<Finding> findings = new ArrayList<>();
        for (Map.Entry<Class<? extends Annotation>, String> e : available.entrySet()) {
            if (AnnotatedElementUtils.hasAnnotation(userClass, e.getKey())) {
                findings.add(new Finding(e.getKey().getSimpleName(), e.getValue(), "클래스"));
            }
        }
        Method[] methods = ReflectionUtils.getUniqueDeclaredMethods(userClass,
                m -> m.getDeclaringClass() != Object.class && !m.isSynthetic() && !m.isBridge());
        for (Method m : methods) {
            for (Map.Entry<Class<? extends Annotation>, String> e : available.entrySet()) {
                if (AnnotatedElementUtils.hasAnnotation(m, e.getKey())) {
                    findings.add(new Finding(e.getKey().getSimpleName(), e.getValue(), "메서드 " + m.getName()));
                }
            }
        }
        return findings;
    }

    /**
     * 찾은 항목들의 분류별 대안 안내를 한 줄로 만든다.
     *
     * @param findings {@link #detect} 결과
     * @return "트랜잭션: ...; 캐시: ..." 형태
     */
    public static String alternatives(List<Finding> findings) {
        Map<String, String> picked = new LinkedHashMap<>();
        for (Finding f : findings) {
            picked.putIfAbsent(f.category(), ALTERNATIVES.get(f.category()));
        }
        StringBuilder sb = new StringBuilder();
        for (Map.Entry<String, String> e : picked.entrySet()) {
            if (!sb.isEmpty()) {
                sb.append("; ");
            }
            sb.append(e.getKey()).append(": ").append(e.getValue());
        }
        return sb.toString();
    }

    /**
     * 찾은 어노테이션 하나.
     *
     * @param annotation 어노테이션 단순 이름 (예: Transactional)
     * @param category   분류 (트랜잭션·캐시·보안·비동기·재시도·검증)
     * @param location   붙은 곳 ("클래스" 또는 "메서드 이름")
     */
    public record Finding(String annotation, String category, String location) {
        @Override
        public String toString() {
            return "@" + annotation + "(" + location + ")";
        }
    }
}
