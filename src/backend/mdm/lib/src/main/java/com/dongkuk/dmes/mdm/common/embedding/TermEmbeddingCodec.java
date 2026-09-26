package com.dongkuk.dmes.mdm.common.embedding;

import java.nio.ByteBuffer;
import java.nio.ByteOrder;

/**
 * {@code EMBEDDING} 칼럼(SQLite BLOB, 4,096바이트) ↔ {@code float[1024]} 변환 — 불변 규칙 I9.
 * float32 little-endian 1024개 = 4,096바이트. L2 노름은 1이어야 한다(허용 오차 1e-3).
 */
public final class TermEmbeddingCodec {

    public static final int DIMENSIONS = 1024;
    public static final int BYTE_LENGTH = DIMENSIONS * Float.BYTES;
    private static final double NORM_TOLERANCE = 1e-3;

    private TermEmbeddingCodec() {
    }

    /** {@code float[1024]} → little-endian {@code byte[4096]}. L2 노름이 1이 아니면 거부한다. */
    public static byte[] encode(float[] vector) {
        if (vector == null || vector.length != DIMENSIONS) {
            throw new IllegalArgumentException(
                    "임베딩 벡터는 " + DIMENSIONS + "차원이어야 한다: " + (vector == null ? "null" : vector.length));
        }
        assertL2Normalized(vector);
        ByteBuffer buffer = ByteBuffer.allocate(BYTE_LENGTH).order(ByteOrder.LITTLE_ENDIAN);
        for (float v : vector) {
            buffer.putFloat(v);
        }
        return buffer.array();
    }

    /** little-endian {@code byte[4096]} → {@code float[1024]}. */
    public static float[] decode(byte[] bytes) {
        if (bytes == null || bytes.length != BYTE_LENGTH) {
            throw new IllegalArgumentException(
                    "임베딩 바이트는 " + BYTE_LENGTH + "바이트여야 한다: " + (bytes == null ? "null" : bytes.length));
        }
        ByteBuffer buffer = ByteBuffer.wrap(bytes).order(ByteOrder.LITTLE_ENDIAN);
        float[] vector = new float[DIMENSIONS];
        for (int i = 0; i < DIMENSIONS; i++) {
            vector[i] = buffer.getFloat();
        }
        return vector;
    }

    /** L2 노름이 1에 가까운지 검증한다(허용 오차 {@value #NORM_TOLERANCE}). */
    public static void assertL2Normalized(float[] vector) {
        double sumSquares = 0d;
        for (float v : vector) {
            sumSquares += (double) v * v;
        }
        double norm = Math.sqrt(sumSquares);
        if (Math.abs(norm - 1.0d) > NORM_TOLERANCE) {
            throw new IllegalArgumentException("임베딩 벡터는 L2 정규화(노름=1)여야 한다: 실제 노름=" + norm);
        }
    }
}
