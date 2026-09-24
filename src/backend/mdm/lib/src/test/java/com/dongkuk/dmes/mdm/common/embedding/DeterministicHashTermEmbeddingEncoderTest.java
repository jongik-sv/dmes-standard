package com.dongkuk.dmes.mdm.common.embedding;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import org.junit.jupiter.api.Test;

/** TSK-04-02 design.md §3.2 — 결정성·차원·노름 검증. */
class DeterministicHashTermEmbeddingEncoderTest {

    private final DeterministicHashTermEmbeddingEncoder encoder = new DeterministicHashTermEmbeddingEncoder();

    @Test
    void isEnabled_은_항상_true다() {
        assertTrue(encoder.isEnabled());
    }

    @Test
    void modelId_는_고정_문자열이다() {
        assertEquals("fake-hash/test-only", encoder.modelId());
    }

    @Test
    void encode_는_1024차원_L2정규화_벡터를_낸다() {
        float[] v = encoder.encode("코일: 압연 후 감아 놓은 강판 (Coil)");
        assertEquals(1024, v.length);
        TermEmbeddingCodec.assertL2Normalized(v); // 예외 없으면 통과
    }

    @Test
    void 같은_입력은_항상_같은_벡터를_낸다() {
        float[] a = encoder.encode("동일입력");
        float[] b = encoder.encode("동일입력");
        assertArrayEquals(a, b);
    }

    @Test
    void 다른_입력은_다른_벡터를_낸다() {
        float[] a = encoder.encode("입력A");
        float[] b = encoder.encode("입력B");
        assertFalse(java.util.Arrays.equals(a, b));
    }
}
