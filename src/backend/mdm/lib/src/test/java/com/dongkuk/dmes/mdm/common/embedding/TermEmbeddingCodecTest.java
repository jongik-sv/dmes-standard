package com.dongkuk.dmes.mdm.common.embedding;

import static org.junit.jupiter.api.Assertions.assertArrayEquals;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;
import org.junit.jupiter.api.Test;

/** TSK-04-02 design.md §3.2 — 불변 규칙 I9: 1024차원·4096바이트·L2 노름1·little-endian 왕복. */
class TermEmbeddingCodecTest {

    private static float[] normalizedVector(int seed) {
        float[] v = new float[1024];
        for (int i = 0; i < v.length; i++) {
            v[i] = (float) Math.sin(seed + i);
        }
        double norm = 0;
        for (float x : v) {
            norm += (double) x * x;
        }
        norm = Math.sqrt(norm);
        for (int i = 0; i < v.length; i++) {
            v[i] = (float) (v[i] / norm);
        }
        return v;
    }

    @Test
    void encode는_4096바이트를_낸다() {
        byte[] bytes = TermEmbeddingCodec.encode(normalizedVector(1));
        assertEquals(4096, bytes.length);
    }

    @Test
    void encode_decode_는_little_endian_으로_왕복한다() {
        float[] original = normalizedVector(2);
        byte[] bytes = TermEmbeddingCodec.encode(original);
        float[] decoded = TermEmbeddingCodec.decode(bytes);
        assertArrayEquals(original, decoded);

        // little-endian 임을 직접 확인 — 수동으로 만든 버퍼와 바이트 단위로 같아야 한다.
        ByteBuffer expected = ByteBuffer.allocate(4096).order(ByteOrder.LITTLE_ENDIAN);
        for (float v : original) {
            expected.putFloat(v);
        }
        assertArrayEquals(expected.array(), bytes);
    }

    @Test
    void L2_정규화가_아닌_벡터는_encode_가_거부한다() {
        float[] notNormalized = new float[1024];
        notNormalized[0] = 5f; // 노름=5
        assertThrows(IllegalArgumentException.class, () -> TermEmbeddingCodec.encode(notNormalized));
    }

    @Test
    void 차원이_다르면_거부한다() {
        assertThrows(IllegalArgumentException.class, () -> TermEmbeddingCodec.encode(new float[100]));
        assertThrows(IllegalArgumentException.class, () -> TermEmbeddingCodec.decode(new byte[100]));
    }
}
