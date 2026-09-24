package com.dongkuk.dmes.mdm.common.embedding;

/**
 * 용어 임베딩 인코더 추상화 — TSK-04-02 design.md D5(TSK-02-02 가 인터페이스를 설계하지 않아 이 작업이
 * 처음 만든다). 구현 3종: {@link NoopTermEmbeddingEncoder}(운영 기본, 비활성),
 * {@link DeterministicHashTermEmbeddingEncoder}(테스트 전용, 결정적 가짜),
 * {@code OnnxKureEmbeddingEncoder}(실 구현, {@code mdm.embedding.encoder=onnx} 수동 게이트 전용).
 *
 * <p>불변 규칙 I9 — 벡터는 L2 정규화 float32 little-endian 1024개(4,096바이트), 풀링은 CLS+L2,
 * 인코딩 입력 문자열은 {@code "{표기}: {정의} ({영문명})"} 고정이다(TSK-02-02 D-024·D-025 계승).
 */
public interface TermEmbeddingEncoder {

    /** 이 인코더가 실제로 인코딩을 수행하는지. {@code false} 면 {@link #encode(String)}을 호출하지 않는다(I12). */
    boolean isEnabled();

    /**
     * 입력 문자열을 1024차원 L2 정규화 float 벡터로 인코딩한다.
     *
     * @param text {@code "{표기}: {정의} ({영문명})"} 형식(I9·I18) — 호출부가 조합해서 넘긴다.
     * @return 길이 1024, L2 노름 1인 벡터
     */
    float[] encode(String text);

    /**
     * 이 인코더·모델을 식별하는 문자열. I11(재인코딩 대상 판정)이 이 값과 저장된 {@code EMBEDDING_MODEL}을
     * 비교한다. 실 구현은 로드한 모델 파일의 sha256 으로 만든다(하드코딩 금지, I9).
     */
    String modelId();
}
