package com.dongkuk.dmes.mdm.common.embedding;

import ai.djl.huggingface.tokenizers.Encoding;
import ai.djl.huggingface.tokenizers.HuggingFaceTokenizer;
import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;
import java.io.IOException;
import java.io.InputStream;
import java.io.UncheckedIOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.Map;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

/**
 * KURE-v1 ONNX INT8 실 구현(수동 게이트 전용) — poc/mdm-embedding-bench 의 {@code KureEncoder} 를 그대로
 * 이식한다(design.md §3.3). {@code mdm.embedding.encoder=onnx} 로만 활성화되고 testAll 은 이 값을 절대
 * 켜지 않는다(I13).
 *
 * <p>풀링은 CLS(첫 토큰) + L2 정규화(불변 규칙 I9). 인코딩 입력 문자열은 호출부(TermMngService)가
 * {@code "{표기}: {정의} ({영문명})"} 형식으로 조합해서 넘긴다.
 *
 * <p>{@code modelId()} 는 실제 로드한 {@code model.onnx} 파일의 sha256 앞 8자로 만든다(하드코딩 금지, I9)
 * — {@code "KURE-v1/int8-{sha8}/cls-l2/in1"}.
 */
@Component
@ConditionalOnProperty(name = "mdm.embedding.encoder", havingValue = "onnx")
public class OnnxKureEmbeddingEncoder implements TermEmbeddingEncoder, AutoCloseable {

    private static final int DIM = 1024;

    private final OrtEnvironment env;
    private final OrtSession session;
    private final HuggingFaceTokenizer tokenizer;
    private final boolean hasTokenTypeIds;
    private final String modelId;

    public OnnxKureEmbeddingEncoder(@Value("${mdm.embedding.model-dir:}") String modelDirProperty) {
        this(resolveModelDir(modelDirProperty), 1);
    }

    /** 순수 JUnit 테스트({@code OnnxKureEmbeddingEncoderManualTest})가 스프링 컨텍스트 없이 직접 호출하는 생성자. */
    public OnnxKureEmbeddingEncoder(Path modelDir, int intraOpThreads) {
        try {
            this.env = OrtEnvironment.getEnvironment();
            OrtSession.SessionOptions opts = new OrtSession.SessionOptions();
            opts.setIntraOpNumThreads(intraOpThreads);
            opts.setInterOpNumThreads(1);
            opts.setExecutionMode(OrtSession.SessionOptions.ExecutionMode.SEQUENTIAL);
            opts.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
            Path modelFile = modelDir.resolve("model.onnx");
            this.session = env.createSession(modelFile.toString(), opts);
            this.hasTokenTypeIds = session.getInputNames().contains("token_type_ids");
            this.tokenizer = HuggingFaceTokenizer.builder()
                    .optTokenizerPath(modelDir.resolve("tokenizer.json"))
                    .optAddSpecialTokens(true)
                    .optPadding(false)
                    .optTruncation(true)
                    .optMaxLength(2048)
                    .build();
            this.modelId = "KURE-v1/int8-" + sha256Prefix8(modelFile) + "/cls-l2/in1";
        } catch (OrtException | IOException e) {
            throw new IllegalStateException(
                    "OnnxKureEmbeddingEncoder 초기화 실패 — modelDir=" + modelDir
                            + "(model.onnx·tokenizer.json 이 있는지 확인)", e);
        }
    }

    private static Path resolveModelDir(String modelDirProperty) {
        if (modelDirProperty == null || modelDirProperty.isBlank()) {
            throw new IllegalStateException(
                    "mdm.embedding.encoder=onnx 인데 mdm.embedding.model-dir 이 비어 있다 — 모델 경로를 지정해야 한다.");
        }
        return Path.of(modelDirProperty);
    }

    @Override
    public boolean isEnabled() {
        return true;
    }

    @Override
    public float[] encode(String text) {
        try {
            Encoding enc = tokenizer.encode(text);
            long[] ids = enc.getIds();
            long[] mask = enc.getAttentionMask();
            int len = ids.length;
            long[][] idsBatch = { ids };
            long[][] maskBatch = { mask };
            try (OnnxTensor tIds = OnnxTensor.createTensor(env, idsBatch);
                 OnnxTensor tMask = OnnxTensor.createTensor(env, maskBatch)) {
                Map<String, OnnxTensor> in = hasTokenTypeIds
                        ? Map.of("input_ids", tIds, "attention_mask", tMask,
                                "token_type_ids", OnnxTensor.createTensor(env, new long[][] { new long[len] }))
                        : Map.of("input_ids", tIds, "attention_mask", tMask);
                try (OrtSession.Result r = session.run(in)) {
                    float[][][] h = (float[][][]) r.get(0).getValue(); // last_hidden_state [1, len, 1024]
                    float[] cls = h[0][0].clone();
                    return l2Normalize(cls);
                }
            }
        } catch (OrtException e) {
            throw new IllegalStateException("ONNX 인코딩 실패: " + e.getMessage(), e);
        }
    }

    @Override
    public String modelId() {
        return modelId;
    }

    private static float[] l2Normalize(float[] v) {
        double s = 0;
        for (float x : v) {
            s += (double) x * x;
        }
        float inv = (float) (1.0 / Math.sqrt(s));
        for (int i = 0; i < v.length; i++) {
            v[i] *= inv;
        }
        return v;
    }

    private static String sha256Prefix8(Path file) {
        try (InputStream in = Files.newInputStream(file)) {
            MessageDigest digest = MessageDigest.getInstance("SHA-256");
            byte[] buf = new byte[8192];
            int n;
            while ((n = in.read(buf)) != -1) {
                digest.update(buf, 0, n);
            }
            String hex = HexFormat.of().formatHex(digest.digest());
            return hex.substring(0, 8);
        } catch (IOException e) {
            throw new UncheckedIOException(e);
        } catch (NoSuchAlgorithmException e) {
            throw new IllegalStateException("SHA-256 알고리즘을 찾을 수 없다", e);
        }
    }

    @Override
    public void close() throws OrtException {
        session.close();
        tokenizer.close();
    }
}
