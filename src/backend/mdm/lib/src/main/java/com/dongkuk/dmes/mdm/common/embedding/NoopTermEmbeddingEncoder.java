package com.dongkuk.dmes.mdm.common.embedding;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * 운영 기본 인코더 — 항상 비활성(I13). TRD.md:137 "모델이 없으면 2차 추천을 끄고 1차 문자열 추천만 한다"를
 * 지킨다. 실제 배포 환경에 모델 파일이 없는 상태에서 가짜 벡터가 {@code EMBEDDING}에 영구히 박히는 사고를
 * 막기 위해, 운영 기본값은 반드시 이 no-op 이어야 한다(D5).
 *
 * <p>{@code mdm.embedding.encoder} 프로퍼티가 없거나(matchIfMissing) {@code none} 이면 이 빈이 뜬다.
 */
@Component
@ConditionalOnProperty(name = "mdm.embedding.encoder", havingValue = "none", matchIfMissing = true)
public class NoopTermEmbeddingEncoder implements TermEmbeddingEncoder {

    @Override
    public boolean isEnabled() {
        return false;
    }

    /** 방어적 구현 — {@link #isEnabled()}가 false 이므로 호출부는 이 메서드를 부르면 안 된다. */
    @Override
    public float[] encode(String text) {
        throw new UnsupportedOperationException(
                "NoopTermEmbeddingEncoder 는 비활성 인코더다 — isEnabled() 를 먼저 확인해야 한다.");
    }

    @Override
    public String modelId() {
        throw new UnsupportedOperationException(
                "NoopTermEmbeddingEncoder 는 비활성 인코더다 — isEnabled() 를 먼저 확인해야 한다.");
    }
}
