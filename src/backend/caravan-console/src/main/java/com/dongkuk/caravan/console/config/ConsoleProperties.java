package com.dongkuk.caravan.console.config;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * caravan-console 설정 — host yml 의 {@code console.*} prefix 바인딩.
 *
 * <pre>
 * console:
 *   works-code: P01                    # caravan-console 인스턴스 공장 식별자 (TB_CARAVAN_APPHOST.WORKS_CD)
 *   message:
 *     max-browse-count: 200            # 메시지 검색 1회 최대 행 수
 *   kafka:
 *     bootstrap-servers: localhost:9092 # (caravan 의존 제거 2026-05-12 이후 사용처 없음 — 테스트 호환 유지)
 * </pre>
 */
@ConfigurationProperties(prefix = "caravan-console")
public record ConsoleProperties(
        String worksCode,
        Message message,
        Kafka kafka
) {

    public record Message(int maxBrowseCount) {
        public Message {
            if (maxBrowseCount <= 0) {
                maxBrowseCount = 200;
            }
        }
    }

    public record Kafka(String bootstrapServers) {}
}
