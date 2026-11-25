package com.dongkuk.dmes.mqc.qpr.inspectionCertificate.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.IOException;
import java.io.InputStream;
import java.util.Optional;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.core.io.ClassPathResource;
import org.springframework.stereotype.Component;

/**
 * 검사증명서 시연 시드(classpath mqc/mtc/seed.json) 읽기. 파일은 화면 쪽 추출 스크립트(scripts/mqc-demo/mtc/)가 만든다.
 * 없거나 읽지 못하면 경고를 남기고 빈 값을 돌려준다(조회는 빈 결과가 된다). OASIS 진입점이 아니다.
 */
@Component
public class MtcSeedSource {

    static final String DEFAULT_PATH = "mqc/mtc/seed.json";
    private static final Logger log = LoggerFactory.getLogger(MtcSeedSource.class);

    private final String path;
    private final ObjectMapper json = new ObjectMapper();

    public MtcSeedSource() {
        this(DEFAULT_PATH);
    }

    MtcSeedSource(String path) {
        this.path = path;
    }

    public Optional<JsonNode> load() {
        ClassPathResource res = new ClassPathResource(path);
        if (!res.exists()) {
            log.warn("검사증명서 시드 파일이 없습니다(classpath {}). 빈 상태로 둡니다.", path);
            return Optional.empty();
        }
        try (InputStream in = res.getInputStream()) {
            JsonNode node = json.readTree(in);
            if (node == null || !node.isObject()) {
                log.warn("검사증명서 시드 파일이 JSON 객체가 아닙니다(classpath {}). 빈 상태로 둡니다.", path);
                return Optional.empty();
            }
            return Optional.of(node);
        } catch (IOException e) {
            log.warn("검사증명서 시드 파일을 읽지 못했습니다(classpath {}): {}", path, e.getMessage());
            return Optional.empty();
        }
    }
}
