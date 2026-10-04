package com.dongkuk.dmes.cactus.oasis.aop;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.aop.support.AopUtils;
import org.springframework.beans.factory.SmartInitializingSingleton;
import org.springframework.context.ApplicationContext;
import org.springframework.context.ConfigurableApplicationContext;
import org.springframework.util.ClassUtils;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

/**
 * BPMN 이 부르는 빈에 붙은 프록시 의존 어노테이션({@code @Transactional}·{@code @Cacheable}·
 * {@code @PreAuthorize}·{@code @Async} 등)을 기동 시점에 찾아 알린다.
 *
 * <p>OASIS 서비스 태스크 경로에서는 이 어노테이션들이 기대대로 동작하지 않는다.
 * <ul>
 *   <li>비트랜잭션 모드 ({@code cactus.oasis.transactional=false}) — {@code CactusUnwrappingApplicationContext}
 *       가 프록시를 벗겨 원본 객체를 부르므로 오류 없이 조용히 무시된다.</li>
 *   <li>트랜잭션 모드 ({@code true}) — oasis-core {@code SpringServiceStarter} 가 컨텍스트를
 *       {@code SpringApplicationContext} 로 바꿔 끼워 프록시를 그대로 부른다. 프록시 클래스 메서드에는
 *       파라미터 이름이 없어, 파라미터가 있는 메서드는 {@code ParameterName must not be null} 로 실패할 수 있다.</li>
 * </ul>
 *
 * <p>검사 대상은 BPMN 의 {@code camunda:class} 가 가리키는 빈뿐이다. 모든 {@code @Service} 를 잡지 않는다
 * (컨트롤러가 주입받아 부르는 일반 빈은 프록시를 거치므로 어노테이션이 정상 동작한다).
 *
 * <p>classpath 로더 모드에서는 모든 싱글톤이 만들어진 뒤 {@code service-path} 아래 BPMN 을 스캔해 검사하고,
 * {@link OasisAopCheckMode#FAIL} 이면 위반이 있을 때 기동을 멈춘다. HTTP 로더 모드는 서비스 문서를 호출 시점에
 * 받아 오므로 기동 시 BPMN 목록이 없다 — 검사할 수 없다는 안내만 한 번 남긴다.
 */
public class OasisAopAnnotationChecker implements SmartInitializingSingleton {

    private static final Logger log = LoggerFactory.getLogger(OasisAopAnnotationChecker.class);

    private final ApplicationContext ctx;
    private final OasisAopCheckMode mode;
    private final String servicePath;
    private final boolean classpathLoader;
    private final boolean transactional;
    private final ProxyDependentAnnotationDetector detector;

    /**
     * @param ctx             Spring 애플리케이션 컨텍스트
     * @param mode            검사 방식 (null 이면 WARN)
     * @param servicePath     BPMN classpath 경로 ({@code cactus.oasis.service-path})
     * @param classpathLoader classpath 로더 모드면 true, HTTP 로더 모드면 false (기동 시 BPMN 목록 유무)
     * @param transactional   {@code cactus.oasis.transactional} — 경고 문구의 결과 설명을 고른다
     */
    public OasisAopAnnotationChecker(ApplicationContext ctx, OasisAopCheckMode mode,
                                     String servicePath, boolean classpathLoader, boolean transactional) {
        if (ctx == null) {
            throw new IllegalArgumentException("org.springframework.context.ApplicationContext is null.");
        }
        this.ctx = ctx;
        this.mode = mode == null ? OasisAopCheckMode.WARN : mode;
        this.servicePath = servicePath;
        this.classpathLoader = classpathLoader;
        this.transactional = transactional;
        this.detector = new ProxyDependentAnnotationDetector(classLoader(ctx));
    }

    /** 모든 싱글톤이 만들어진 뒤 기동 검사를 한다. */
    @Override
    public void afterSingletonsInstantiated() {
        if (mode == OasisAopCheckMode.OFF) {
            return;
        }
        if (!classpathLoader) {
            log.warn("[Cactus Oasis] AOP 검사 — HTTP 로더 모드라 기동 시 BPMN 목록을 알 수 없어 검사하지 않는다 (mode={}). "
                    + "BPMN 이 부르는 빈에 @Transactional·@Cacheable 등을 두지 않았는지 classpath 모드에서 확인한다.",
                    mode.name().toLowerCase());
            return;
        }
        List<Violation> violations = check();
        if (violations.isEmpty()) {
            return;
        }
        if (mode == OasisAopCheckMode.FAIL) {
            StringBuilder sb = new StringBuilder("BPMN 이 부르는 빈에 프록시 의존 어노테이션이 있다 "
                    + "(cactus.oasis.aop-check=fail): ");
            for (Violation v : violations) {
                sb.append(System.lineSeparator()).append(" - ").append(v.message(transactional));
            }
            throw new IllegalStateException(sb.toString());
        }
        for (Violation v : violations) {
            log.warn("[Cactus Oasis] AOP 검사 — {}", v.message(transactional));
        }
    }

    /**
     * classpath BPMN 을 스캔해 참조 빈을 검사한다.
     *
     * <p>같은 빈을 BPMN 마다 빈 이름·클래스 이름으로 달리 불러도, 그 빈을 부르는 BPMN 을 모두 모아 위반 하나에 담는다.
     *
     * @return 위반 목록 (빈을 처음 만난 참조 이름순, 빈별 1건)
     */
    List<Violation> check() {
        BpmnServiceClassScanner.Scan scan = new BpmnServiceClassScanner(classLoader(ctx)).scan(servicePath);
        Map<String, Set<String>> bpmnFilesByBean = new LinkedHashMap<>();
        for (Map.Entry<String, Set<String>> ref : scan.refs().entrySet()) {
            for (String beanName : resolveBeanNames(ref.getKey())) {
                bpmnFilesByBean.computeIfAbsent(beanName, k -> new TreeSet<>()).addAll(ref.getValue());
            }
        }
        List<Violation> violations = new ArrayList<>();
        for (Map.Entry<String, Set<String>> bean : bpmnFilesByBean.entrySet()) {
            Class<?> targetClass = targetClassOf(bean.getKey());
            List<ProxyDependentAnnotationDetector.Finding> findings = detector.detect(targetClass);
            if (!findings.isEmpty()) {
                violations.add(new Violation(bean.getKey(), targetClass, findings, bean.getValue()));
            }
        }
        log.info("[Cactus Oasis] AOP 검사 — BPMN {}개, 참조 빈 {}개, 프록시 의존 어노테이션 위반 {}건 (mode={})",
                scan.bpmnCount(), bpmnFilesByBean.size(), violations.size(), mode.name().toLowerCase());
        return violations;
    }

    /**
     * BPMN 참조 이름을 빈 이름으로 푼다. oasis-core {@code PlainJavaServiceTaskExecutable} 과 같은 순서
     * (빈 이름 조회 → 클래스 이름으로 타입 조회)를 따른다. 풀리지 않으면 빈 목록.
     */
    private List<String> resolveBeanNames(String ref) {
        if (ctx.containsBean(ref)) {
            return List.of(ref);
        }
        try {
            Class<?> type = ClassUtils.forName(ref, classLoader(ctx));
            return List.of(ctx.getBeanNamesForType(type));
        } catch (ClassNotFoundException | LinkageError e) {
            log.debug("[Cactus Oasis] AOP 검사 — BPMN 참조 '{}' 에 맞는 빈이 없어 건너뛴다", ref);
            return List.of();
        }
    }

    /**
     * 빈의 원본 클래스. 이미 만들어진 싱글톤이면 {@link AopUtils#getTargetClass} 로, 아니면 빈 정의 타입에서
     * CGLIB 접미어를 벗겨 얻는다 (지연 빈을 검사 때문에 미리 만들지 않는다).
     */
    private Class<?> targetClassOf(String beanName) {
        if (ctx instanceof ConfigurableApplicationContext cac
                && cac.getBeanFactory().containsSingleton(beanName)) {
            Object bean = cac.getBeanFactory().getSingleton(beanName);
            if (bean != null) {
                return AopUtils.getTargetClass(bean);
            }
        }
        Class<?> type = ctx.getType(beanName);
        return type == null ? null : ClassUtils.getUserClass(type);
    }

    private static ClassLoader classLoader(ApplicationContext ctx) {
        ClassLoader cl = ctx.getClassLoader();
        return cl != null ? cl : ClassUtils.getDefaultClassLoader();
    }

    /**
     * 위반 하나.
     *
     * @param beanName    빈 이름
     * @param targetClass 원본 클래스
     * @param findings    찾은 어노테이션
     * @param bpmnFiles   그 빈을 부르는 BPMN 파일
     */
    record Violation(String beanName, Class<?> targetClass,
                     List<ProxyDependentAnnotationDetector.Finding> findings, Set<String> bpmnFiles) {

        /**
         * 경고 문구 — 빈 이름·클래스·어노테이션·결과·부르는 BPMN·대안.
         *
         * @param transactional {@code cactus.oasis.transactional} 값
         */
        String message(boolean transactional) {
            StringBuilder sb = new StringBuilder()
                    .append("빈 '").append(beanName).append("' (")
                    .append(targetClass == null ? "?" : targetClass.getName()).append(") 의 ")
                    .append(findings)
                    .append(transactional
                            ? " 는 OASIS 가 프록시를 그대로 불러, 파라미터가 있는 메서드는 'ParameterName must not be null' 로 실패할 수 있다"
                            : " 는 OASIS 가 프록시를 벗겨 부르므로 적용되지 않는다(오류 없이 무시)");
            if (!bpmnFiles.isEmpty()) {
                sb.append(". 부르는 BPMN: ").append(bpmnFiles);
            }
            sb.append(". 대안 — ").append(ProxyDependentAnnotationDetector.alternatives(findings));
            return sb.toString();
        }
    }
}
