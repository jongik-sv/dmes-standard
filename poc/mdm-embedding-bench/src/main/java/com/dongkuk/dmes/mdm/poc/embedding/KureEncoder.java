package com.dongkuk.dmes.mdm.poc.embedding;

import ai.djl.huggingface.tokenizers.Encoding;
import ai.djl.huggingface.tokenizers.HuggingFaceTokenizer;
import ai.onnxruntime.NodeInfo;
import ai.onnxruntime.OnnxTensor;
import ai.onnxruntime.OrtEnvironment;
import ai.onnxruntime.OrtException;
import ai.onnxruntime.OrtSession;
import java.io.IOException;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;

/**
 * KURE-v1 ONNX INT8 인코더 — 토크나이저(tokenizer.json) + ONNX Runtime CPU 세션.
 *
 * <p>풀링은 CLS(첫 토큰 = {@code <s>})이고 L2 정규화한다. 근거는 원본 {@code nlpai-lab/KURE-v1} 의
 * {@code 1_Pooling/config.json}({@code pooling_mode_cls_token: true})과 {@code modules.json}(2_Normalize),
 * 원천 02:536 "풀링(CLS)과 L2 정규화는 Java 쪽에서". INT8 변환본 README 의 "masked mean pool" 은 이 모델에 맞지 않는다.
 * 비교용으로 masked mean 도 함께 돌려준다({@link Pooled#mean}).
 */
public final class KureEncoder implements AutoCloseable {

    public static final int DIM = 1024;

    /** 한 입력의 두 풀링 결과(둘 다 L2 정규화). */
    public record Pooled(float[] cls, float[] mean) {}

    private final OrtEnvironment env;
    private final OrtSession session;
    private final HuggingFaceTokenizer tokenizer;
    private final boolean hasTokenTypeIds;

    public KureEncoder(Path modelDir, int intraOpThreads) throws OrtException, IOException {
        this.env = OrtEnvironment.getEnvironment();
        OrtSession.SessionOptions opts = new OrtSession.SessionOptions();
        opts.setIntraOpNumThreads(intraOpThreads);
        opts.setInterOpNumThreads(1);
        opts.setExecutionMode(OrtSession.SessionOptions.ExecutionMode.SEQUENTIAL);
        opts.setOptimizationLevel(OrtSession.SessionOptions.OptLevel.ALL_OPT);
        this.session = env.createSession(modelDir.resolve("model.onnx").toString(), opts);
        this.hasTokenTypeIds = session.getInputNames().contains("token_type_ids");
        // tokenizer.json 의 truncation(max_length 2048)·post_processor(<s> … </s>)를 그대로 쓴다.
        // 패딩은 encode() 가 배치 최장 길이로 직접 한다(pad_id 1, attention_mask 0).
        this.tokenizer = HuggingFaceTokenizer.builder()
                .optTokenizerPath(modelDir.resolve("tokenizer.json"))
                .optAddSpecialTokens(true)
                .optPadding(false)
                .optTruncation(true)
                .optMaxLength(2048)
                .build();
    }

    public Map<String, NodeInfo> inputs() throws OrtException {
        return session.getInputInfo();
    }

    public Map<String, NodeInfo> outputs() throws OrtException {
        return session.getOutputInfo();
    }

    public HuggingFaceTokenizer tokenizer() {
        return tokenizer;
    }

    /** 토큰 수(특수 토큰 포함). */
    public int tokenCount(String text) {
        return tokenizer.encode(text).getIds().length;
    }

    public float[] encodeCls(String text) throws OrtException {
        return encode(List.of(text))[0].cls();
    }

    /** 배치 인코딩. 배치 안에서는 최장 길이로 패딩하고 attention_mask 로 가린다. */
    public Pooled[] encode(List<String> texts) throws OrtException {
        Encoding[] encs = tokenizer.batchEncode(texts);
        int b = encs.length;
        int len = 0;
        for (Encoding e : encs) {
            len = Math.max(len, e.getIds().length);
        }
        long[][] ids = new long[b][len];
        long[][] mask = new long[b][len];
        for (int i = 0; i < b; i++) {
            long[] id = encs[i].getIds();
            long[] m = encs[i].getAttentionMask();
            for (int j = 0; j < len; j++) {
                ids[i][j] = j < id.length ? id[j] : 1L;   // pad_id = 1 (<pad>)
                mask[i][j] = j < m.length ? m[j] : 0L;
            }
        }
        try (OnnxTensor tIds = OnnxTensor.createTensor(env, ids);
             OnnxTensor tMask = OnnxTensor.createTensor(env, mask)) {
            Map<String, OnnxTensor> in = hasTokenTypeIds
                    ? Map.of("input_ids", tIds, "attention_mask", tMask,
                            "token_type_ids", OnnxTensor.createTensor(env, new long[b][len]))
                    : Map.of("input_ids", tIds, "attention_mask", tMask);
            try (OrtSession.Result r = session.run(in)) {
                float[][][] h = (float[][][]) r.get(0).getValue();   // last_hidden_state [b, len, 1024]
                Pooled[] out = new Pooled[b];
                for (int i = 0; i < b; i++) {
                    float[] cls = h[i][0].clone();
                    float[] mean = new float[DIM];
                    int n = 0;
                    for (int j = 0; j < len; j++) {
                        if (mask[i][j] == 0) {
                            continue;
                        }
                        n++;
                        float[] row = h[i][j];
                        for (int k = 0; k < DIM; k++) {
                            mean[k] += row[k];
                        }
                    }
                    for (int k = 0; k < DIM; k++) {
                        mean[k] /= n;
                    }
                    out[i] = new Pooled(l2(cls), l2(mean));
                }
                return out;
            }
        }
    }

    static float[] l2(float[] v) {
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

    @Override
    public void close() throws OrtException {
        session.close();
        tokenizer.close();
    }
}
