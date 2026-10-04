package com.dongkuk.dmes.cactus.oasis.aop;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.Resource;
import org.springframework.core.io.support.PathMatchingResourcePatternResolver;
import org.springframework.core.io.support.ResourcePatternResolver;

import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;
import java.io.IOException;
import java.io.InputStream;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;
import java.util.TreeSet;

/**
 * classpath 의 BPMN 을 훑어 {@code camunda:class} 로 참조하는 빈 이름(또는 클래스 이름)을 모은다.
 *
 * <p>oasis-core 의 {@code CamundaAttributeExtractor.className} 과 같은 속성(camunda 네임스페이스의
 * {@code class})만 읽는다. {@code Class#method} 형태는 {@code JavaServiceTaskExecutable} 과 같이
 * {@code #} 앞부분만 쓴다. BPMN 에는 expression·delegateExpression 으로 빈을 찾는 경로가 없다.
 *
 * <p>읽지 못한 파일은 경고 로그만 남기고 건너뛴다 (검사 때문에 기동이 깨지지 않게).
 */
public final class BpmnServiceClassScanner {

    private static final Logger log = LoggerFactory.getLogger(BpmnServiceClassScanner.class);

    /** camunda 확장 네임스페이스 */
    static final String CAMUNDA_NS = "http://camunda.org/schema/1.0/bpmn";

    private final ResourcePatternResolver resolver;

    /**
     * @param classLoader BPMN 을 찾을 클래스 로더
     */
    public BpmnServiceClassScanner(ClassLoader classLoader) {
        this.resolver = new PathMatchingResourcePatternResolver(classLoader);
    }

    /**
     * {@code cactus.oasis.service-path} 기준 classpath 검색 패턴을 만든다.
     * 예: {@code "/services"} → {@code "classpath*:services/**}{@code /*.bpmn"}.
     *
     * @param servicePath 서비스 경로 (앞뒤 {@code /}·{@code classpath:} 접두어 허용)
     * @return classpath* 검색 패턴
     */
    static String pattern(String servicePath) {
        String p = servicePath == null ? "" : servicePath.trim();
        if (p.startsWith("classpath*:")) {
            p = p.substring("classpath*:".length());
        } else if (p.startsWith("classpath:")) {
            p = p.substring("classpath:".length());
        }
        while (p.startsWith("/")) {
            p = p.substring(1);
        }
        while (p.endsWith("/")) {
            p = p.substring(0, p.length() - 1);
        }
        return p.isEmpty() ? "classpath*:**/*.bpmn" : "classpath*:" + p + "/**/*.bpmn";
    }

    /**
     * BPMN 을 스캔한다.
     *
     * @param servicePath 서비스 경로
     * @return 참조 이름(빈 이름 또는 클래스 이름) → 그 이름을 쓰는 BPMN 파일 이름들. 이름순 정렬
     */
    public Scan scan(String servicePath) {
        Map<String, Set<String>> refs = new TreeMap<>();
        Resource[] resources;
        try {
            resources = resolver.getResources(pattern(servicePath));
        } catch (IOException e) {
            log.warn("[Cactus Oasis] AOP 검사 — BPMN 목록을 읽지 못해 기동 검사를 건너뛴다: {}", e.getMessage());
            return new Scan(0, refs);
        }
        for (Resource r : resources) {
            String name = r.getFilename() != null ? r.getFilename() : r.getDescription();
            try (InputStream in = r.getInputStream()) {
                for (String ref : classRefs(in)) {
                    refs.computeIfAbsent(ref, k -> new TreeSet<>()).add(name);
                }
            } catch (IOException | XMLStreamException e) {
                log.warn("[Cactus Oasis] AOP 검사 — BPMN 을 읽지 못해 건너뛴다: {} ({})", name, e.getMessage());
            }
        }
        return new Scan(resources.length, refs);
    }

    /**
     * BPMN 한 개에서 {@code camunda:class} 값을 모은다.
     *
     * @param in BPMN XML
     * @return {@code #} 앞부분만 남긴 참조 이름들
     */
    static Set<String> classRefs(InputStream in) throws XMLStreamException {
        XMLInputFactory factory = XMLInputFactory.newFactory();
        factory.setProperty(XMLInputFactory.SUPPORT_DTD, false);
        factory.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
        Set<String> refs = new TreeSet<>();
        XMLStreamReader reader = factory.createXMLStreamReader(in);
        try {
            while (reader.hasNext()) {
                if (reader.next() != XMLStreamConstants.START_ELEMENT) {
                    continue;
                }
                for (int i = 0; i < reader.getAttributeCount(); i++) {
                    if (!"class".equals(reader.getAttributeLocalName(i))
                            || !CAMUNDA_NS.equals(reader.getAttributeNamespace(i))) {
                        continue;
                    }
                    String value = reader.getAttributeValue(i);
                    if (value == null) {
                        continue;
                    }
                    String ref = value.split("#")[0].trim();
                    if (!ref.isEmpty()) {
                        refs.add(ref);
                    }
                }
            }
        } finally {
            reader.close();
        }
        return refs;
    }

    /**
     * 스캔 결과.
     *
     * @param bpmnCount 읽은 BPMN 수
     * @param refs      참조 이름 → BPMN 파일 이름들
     */
    public record Scan(int bpmnCount, Map<String, Set<String>> refs) {
    }
}
