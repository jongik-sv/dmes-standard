package com.dongkuk.dmes.mdm.dma.termMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.mdm.common.embedding.NoopTermEmbeddingEncoder;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingCodec;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingEncoder;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingRepository;
import com.dongkuk.dmes.mdm.common.testdb.AbstractMdmSharedDbTest;
import com.dongkuk.dmes.mdm.dma.termMng.dto.ReencodeBatchRequest;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermSaveRequest;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermSaveResult;
import com.dongkuk.dmes.mdm.dma.termMng.service.TermMngService;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import java.util.Arrays;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.TestPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * TSK-04-02 design.md §3.2 — I11(EMBEDDING_MODEL 이 다르거나 NULL 인 행만 대상), I12(인코더 비활성이면
 * 즉시 반환하고 아무 것도 건드리지 않는다). {@code fake} 인코더를 이 클래스 전용으로만 켠다(I13).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
@TestPropertySource(properties = "mdm.embedding.encoder=fake")
class TermReencodeBatchTest extends AbstractMdmSharedDbTest {

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
    @Autowired
    PlatformTransactionManager transactionManager;

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

    // ── advisor 지적 — save() 가 "인코더 활성" 상태로 실제로 호출되는 경로는 이 클래스(fake 인코더 컨텍스트)
    // 에만 있었는데, 정작 save() 자체를 부르는 테스트가 없어 saveAndFlush→updateEmbedding==1 검증(I12
    // "입력 필드 변경 시 재인코딩") 경로가 커버되지 않았다. 이 클래스의 fake 인코더 컨텍스트를 그대로 써서
    // 보강한다.

    private static TermSaveRequest req(String termName, int senseNo, String definition) {
        TermSaveRequest r = new TermSaveRequest();
        r.setTermName(termName);
        r.setSenseNo(senseNo);
        r.setDefinition(definition);
        return r;
    }

    @Test
    void 인코더가_활성이면_신규_저장에서_바로_EMBEDDING이_채워진다() {
        TermSaveResult saved = service.save(req("활성인코딩", 1, "정의"));
        assertEquals(encoder.modelId(), embeddingRepository.findEmbeddingModel(saved.getTermId()).orElseThrow());
        assertTrue(embeddingRepository.findEmbedding(saved.getTermId()).isPresent());
    }

    @Test
    void 트랜잭션이_커밋되면_임베딩과_캐시가_모두_반영된다() {
        TransactionTemplate tx = new TransactionTemplate(transactionManager);
        Long termId = tx.execute(status -> service.save(req("커밋확인", 1, "정의")).getTermId());

        assertNotNull(termId);
        assertTrue(embeddingRepository.findEmbedding(termId).isPresent(), "커밋 후에는 EMBEDDING 이 있어야 한다");
        assertNotNull(cache.get(termId), "커밋 후에는 캐시에도 반영돼야 한다(afterCommit 콜백 실행 확인)");
        assertNotNull(cache.get(termId).embedding(), "캐시 항목의 embedding 도 채워져야 한다");
    }

    @Test
    void definition을_수정하면_EMBEDDING_벡터가_바뀐다() {
        TermSaveResult saved = service.save(req("정의변경", 1, "원래 정의"));
        float[] before = cache.get(saved.getTermId()).embedding();

        TermSaveRequest update = req("정의변경", 1, "완전히 다른 정의");
        update.setTermId(saved.getTermId());
        service.save(update);

        float[] after = cache.get(saved.getTermId()).embedding();
        assertFalse(Arrays.equals(before, after), "정의가 바뀌면 임베딩 벡터도 바뀌어야 한다(I12 재인코딩)");
    }

    @Test
    void 인코더가_비활성인_서비스로_수정하면_EMBEDDING이_NULL로_지워진다() {
        TermSaveResult saved = service.save(req("나중에비활성", 1, "원래 정의")); // fake 인코더로 저장 — EMBEDDING 있음.
        assertTrue(embeddingRepository.findEmbedding(saved.getTermId()).isPresent());

        TermMngService disabledService = new TermMngService(
                termRepository, embeddingRepository, cache, new NoopTermEmbeddingEncoder());
        TermSaveRequest update = req("나중에비활성", 1, "바뀐 정의"); // 인코딩 입력 필드 변경 → clear 대상(I12).
        update.setTermId(saved.getTermId());
        disabledService.save(update);

        assertTrue(embeddingRepository.findEmbedding(saved.getTermId()).isEmpty(),
                "인코더가 비활성이면 재인코딩 없이 NULL 로 지워진 채 남아야 한다");
        assertTrue(embeddingRepository.findEmbeddingModel(saved.getTermId()).isEmpty()
                || embeddingRepository.findEmbeddingModel(saved.getTermId()).get() == null);
    }
}
