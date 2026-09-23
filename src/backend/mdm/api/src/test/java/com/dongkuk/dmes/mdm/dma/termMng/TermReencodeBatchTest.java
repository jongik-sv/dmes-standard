package com.dongkuk.dmes.mdm.dma.termMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.embedding.NoopTermEmbeddingEncoder;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingCodec;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingEncoder;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingRepository;
import com.dongkuk.dmes.mdm.dma.termMng.dto.ReencodeBatchRequest;
import com.dongkuk.dmes.mdm.dma.termMng.service.TermMngService;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import java.nio.file.Path;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.test.context.TestPropertySource;

/**
 * TSK-04-02 design.md §3.2 — I11(EMBEDDING_MODEL 이 다르거나 NULL 인 행만 대상), I12(인코더 비활성이면
 * 즉시 반환하고 아무 것도 건드리지 않는다). {@code fake} 인코더를 이 클래스 전용으로만 켠다(I13).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@TestPropertySource(properties = "mdm.embedding.encoder=fake")
class TermReencodeBatchTest {

    @TempDir
    static Path tempDir;

    @Autowired
    TermMngService service;
    @Autowired
    MdmTermRepository termRepository;
    @Autowired
    TermEmbeddingRepository embeddingRepository;
    @Autowired
    TermRecommendationCache cache;
    @Autowired
    TermEmbeddingEncoder encoder; // fake(DeterministicHashTermEmbeddingEncoder)

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("term-reencode-batch-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void cleanUp() {
        termRepository.deleteAll();
        cache.reloadAll();
    }

    private static final com.dongkuk.dmes.mdm.common.embedding.DeterministicHashTermEmbeddingEncoder FIXTURE_ENCODER =
            new com.dongkuk.dmes.mdm.common.embedding.DeterministicHashTermEmbeddingEncoder();

    /** 기존에 이미 인코딩된 것처럼 EMBEDDING/EMBEDDING_MODEL 을 미리 채워 둔다(서비스의 save() 경로를 타지 않는다). */
    private long insertTermWithModel(String termName, String embeddingModel) {
        MdmTerm term = termRepository.saveAndFlush(new MdmTerm(termName, 1, "정의"));
        if (embeddingModel != null) {
            byte[] bytes = TermEmbeddingCodec.encode(FIXTURE_ENCODER.encode(termName)); // 유효한(L2=1) 임의 벡터
            embeddingRepository.updateEmbedding(term.getTermId(), bytes, embeddingModel);
        }
        return term.getTermId();
    }

    @Test
    void I11_EMBEDDING_MODEL이_NULL이거나_다른_행만_대상으로_잡는다() {
        long staleNull = insertTermWithModel("모델없음", null);
        long staleOld = insertTermWithModel("옛모델", "old-model-v0");
        long current = insertTermWithModel("현재모델", encoder.modelId());

        Map<String, Object> result = service.reencodeBatch(reencodeReq(10));

        assertEquals(true, result.get("enabled"));
        assertEquals(2, result.get("processed"), result.toString());
        assertEquals(0, result.get("remaining"));
        assertEquals(true, result.get("done"));

        assertEquals(encoder.modelId(), embeddingRepository.findEmbeddingModel(staleNull).orElseThrow());
        assertEquals(encoder.modelId(), embeddingRepository.findEmbeddingModel(staleOld).orElseThrow());
        assertEquals(encoder.modelId(), embeddingRepository.findEmbeddingModel(current).orElseThrow());
    }

    @Test
    void 청크_크기보다_대상이_많으면_한_번에_청크만큼만_처리한다() {
        for (int i = 0; i < 5; i++) {
            insertTermWithModel("청크대상" + i, null);
        }
        Map<String, Object> result = service.reencodeBatch(reencodeReq(3));
        assertEquals(3, result.get("processed"));
        assertEquals(2, result.get("remaining"));
        assertEquals(false, result.get("done"));

        Map<String, Object> second = service.reencodeBatch(reencodeReq(3));
        assertEquals(2, second.get("processed"));
        assertEquals(0, second.get("remaining"));
        assertEquals(true, second.get("done"));
    }

    @Test
    void I12_인코더가_비활성이면_즉시_반환하고_아무것도_건드리지_않는다() {
        long termId = insertTermWithModel("비활성대상", null);
        TermMngService disabledService = new TermMngService(
                termRepository, embeddingRepository, cache, new NoopTermEmbeddingEncoder());

        Map<String, Object> result = disabledService.reencodeBatch(reencodeReq(500));

        assertEquals(false, result.get("enabled"));
        assertEquals(0, result.get("processed"));
        assertTrue(embeddingRepository.findEmbeddingModel(termId).isEmpty()
                || embeddingRepository.findEmbeddingModel(termId).get() == null,
                "비활성 인코더는 대상 행을 건드리면 안 된다");
    }

    private static ReencodeBatchRequest reencodeReq(int chunkSize) {
        ReencodeBatchRequest r = new ReencodeBatchRequest();
        r.setChunkSize(chunkSize);
        return r;
    }
}
