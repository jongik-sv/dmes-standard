package com.dongkuk.dmes.mdm.common.embedding;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Random;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * 테스트 전용 결정적 가짜 인코더 — testAll·e2e 는 실제 ONNX 모델·네트워크에 기대지 않는다(팀장 지시,
 * design.md D5). 같은 입력 문자열은 항상 같은 벡터를 낸다(해시를 시드로 쓰는 PRNG). main
 * {@code application.yml}에는 이 값을 두지 않고, 필요한 테스트 클래스에
 * {@code @TestPropertySource(properties="mdm.embedding.encoder=fake")}로만 켠다(I13).
 */
@Component
@ConditionalOnProperty(name = "mdm.embedding.encoder", havingValue = "fake")
public class DeterministicHashTermEmbeddingEncoder implements TermEmbeddingEncoder {

    public static final String MODEL_ID = "fake-hash/test-only";
    private static final int DIMENSIONS = 1024;

    @Override
    public boolean isEnabled() {
        return true;
    }

    @Override
    public float[] encode(String text) {
        long seed = seedOf(text == null ? "" : text);
        Random random = new Random(seed);
        float[] vector = new float[DIMENSIONS];
        double sumSquares = 0d;
        for (int i = 0; i < DIMENSIONS; i++) {
            float v = (float) random.nextGaussian();
            vector[i] = v;
            sumSquares += (double) v * v;
        }
        double norm = Math.sqrt(sumSquares);
        if (norm == 0d) {
            // 이론상 발생하지 않지만(가우시안 전부 0), 방어적으로 첫 성분에 1을 둔다.
            vector[0] = 1f;
            norm = 1d;
        }
        for (int i = 0; i < DIMENSIONS; i++) {
            vector[i] = (float) (vector[i] / norm);
        }
        return vector;
    }

    @Override
    public String modelId() {
        return MODEL_ID;
    }

    /** 입력 문자열의 SHA-256 앞 8바이트를 long 시드로 쓴다 — 같은 입력은 항상 같은 시드(결정성). */
    private static long seedOf(String text) {
        try {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] hash = digest.digest(text.getBytes(StandardCharsets.UTF_8));
            long seed = 0L;
            for (int i = 0; i < 8; i++) {
                seed = (seed << 8) | (hash[i] & 0xFF);
            }
            return seed;
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 알고리즘을 찾을 수 없다", e);
        }
    }
}
