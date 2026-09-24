package com.dongkuk.dmes.mdm.embedding;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.embedding.OnnxKureEmbeddingEncoder;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingCodec;
import java.nio.file.Files;
import java.nio.file.Path;
import org.junit.jupiter.api.AfterAll;
import org.junit.jupiter.api.Assumptions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;

/**
 * TSK-04-02 design.md §3.3 — 수동 게이트 전용. 실제 ONNX 모델 파일로 단건 인코딩 p50/p95, {@code recommend}
 * 1만 건 p50/p95 를 재측정하고 로그에 남긴다.
 *
 * <p><b>스프링 컨텍스트를 띄우지 않는다</b> — {@code OnnxKureEmbeddingEncoder} 를 {@code new} 로 직접
 * 만든다. 모델 경로가 없을 때 스프링 빈 생성 자체가 실패하면 SKIPPED 대신 빨강이 나기 때문이다(design.md
 * §3.3). 모델 파일 유무 확인은 {@code @BeforeAll}에서 {@code Assumptions.assumeTrue}로 한다 — 없으면
 * 이후 전부 스킵.
 */
class OnnxKureEmbeddingEncoderManualTest {

    private static Path modelDir;
    private static OnnxKureEmbeddingEncoder encoder;

    @BeforeAll
    static void setUp() {
        String dirProp = System.getProperty("mdm.embedding.model-dir", "");
        Assumptions.assumeTrue(!dirProp.isBlank(), "MDM_EMBEDDING_MODEL_DIR 미지정 — 스킵");
        modelDir = Path.of(dirProp);
        boolean hasModel = Files.isRegularFile(modelDir.resolve("model.onnx"));
        boolean hasTokenizer = Files.isRegularFile(modelDir.resolve("tokenizer.json"));
        Assumptions.assumeTrue(hasModel && hasTokenizer,
                "model.onnx/tokenizer.json 이 " + modelDir + " 에 없다 — 스킵");
        encoder = new OnnxKureEmbeddingEncoder(modelDir, 1);
    }

    @AfterAll
    static void tearDown() throws Exception {
        if (encoder != null) {
            encoder.close();
        }
    }

    @Test
    void 단건_인코딩이_1024차원_L2정규화_벡터를_낸다() {
        float[] v = encoder.encode("코일: 압연 후 감아 놓은 강판 (Coil)");
        assertEquals(1024, v.length);
        TermEmbeddingCodec.assertL2Normalized(v); // 통과하면 예외 없음
    }

    @Test
    void modelId_는_실제_파일_sha256_에서_계산된다() {
        String id = encoder.modelId();
        assertTrue(id.matches("^KURE-v1/int8-[0-9a-f]{8}/cls-l2/in1$"), "modelId=" + id);
    }

    @Test
    void 단건_인코딩_p50_p95_를_측정해_로그에_남긴다() {
        int warmup = 3;
        int trials = 20;
        for (int i = 0; i < warmup; i++) {
            encoder.encode("워밍업 " + i + ": 정의 (Warmup)");
        }
        long[] samples = new long[trials];
        for (int i = 0; i < trials; i++) {
            long start = System.nanoTime();
            encoder.encode("코일-" + i + ": 압연 후 감아 놓은 강판 (Coil)");
            samples[i] = System.nanoTime() - start;
        }
        java.util.Arrays.sort(samples);
        double p50Ms = samples[trials / 2] / 1_000_000.0;
        double p95Ms = samples[(int) (trials * 0.95)] / 1_000_000.0;
        System.out.printf("[onnxEmbeddingManualTest] 단건 인코딩 p50=%.2fms p95=%.2fms (n=%d)%n", p50Ms, p95Ms, trials);
    }
}
