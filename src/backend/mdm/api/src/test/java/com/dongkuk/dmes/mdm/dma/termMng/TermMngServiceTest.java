package com.dongkuk.dmes.mdm.dma.termMng;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingRepository;
import com.dongkuk.dmes.mdm.dma.termMng.dto.RecommendRequest;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermSaveRequest;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermSaveResult;
import com.dongkuk.dmes.mdm.dma.termMng.service.TermMngService;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import java.nio.file.Path;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.io.TempDir;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.DynamicPropertyRegistry;
import org.springframework.test.context.DynamicPropertySource;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * TSK-04-02 design.md §3.2 — I6(중복 거부), I7(정의 필수), I8(약어 중복 경고), I12(인코더 비활성),
 * I18(경계값), I19(롤백 시 캐시 갱신 안 됨). {@code @Transactional} 을 붙이지 않는다 — I19 가 캐시 갱신을
 * 커밋 후로 미루므로, 클래스 트랜잭션이 있으면 커밋 콜백 자체가 일어나지 않아 저장 직후 캐시를 확인하는
 * 케이스가 항상 거짓 실패한다. 대신 {@code @BeforeEach} 가 테이블을 지우고 캐시를 리셋한다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.MOCK)
@ActiveProfiles("local")
class TermMngServiceTest {

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
    PlatformTransactionManager transactionManager;

    @DynamicPropertySource
    static void overrideDatasource(DynamicPropertyRegistry registry) {
        Path dbFile = tempDir.resolve("term-mng-service-test.db");
        registry.add("spring.datasource.url", () -> "jdbc:sqlite:" + dbFile);
    }

    @BeforeEach
    void cleanUp() {
        termRepository.deleteAll();
        cache.reloadAll();
    }

    private static TermSaveRequest req(String termName, int senseNo, String definition) {
        TermSaveRequest r = new TermSaveRequest();
        r.setTermName(termName);
        r.setSenseNo(senseNo);
        r.setDefinition(definition);
        return r;
    }

    // ── I6 ──

    @Test
    void I6_같은_표기_의미번호_중복_저장은_거부한다() {
        service.save(req("구름", 1, "하늘의 물방울 집합"));
        BusinessException ex = assertThrows(BusinessException.class,
                () -> service.save(req("구름", 1, "다른 정의")));
        assertTrue(ex.getMessage().contains("이미"), ex.getMessage());
    }

    @Test
    void I6_같은_표기라도_의미번호가_다르면_저장된다() {
        service.save(req("배", 1, "과일"));
        TermSaveResult second = service.save(req("배", 2, "탈것"));
        assertNotNull(second.getTermId());
    }

    @Test
    void I6_자기_자신을_수정할_때는_중복으로_보지_않는다() {
        TermSaveResult saved = service.save(req("눈", 1, "겨울에 내리는 것"));
        TermSaveRequest update = req("눈", 1, "겨울에 내리는 흰 것");
        update.setTermId(saved.getTermId());
        TermSaveResult updated = service.save(update);
        assertEquals(saved.getTermId(), updated.getTermId());
    }

    // ── I7 ──

    @Test
    void I7_정의가_없으면_저장을_거부한다() {
        assertThrows(BusinessException.class, () -> service.save(req("허공", 1, "")));
        assertThrows(BusinessException.class, () -> service.save(req("허공2", 1, null)));
    }

    // ── I8 ──

    @Test
    void I8_영문약어_중복은_저장을_막지_않고_경고만_낸다() {
        TermSaveRequest first = req("코일", 1, "감아 놓은 강판");
        first.setEngAbbr("COIL");
        service.save(first);

        TermSaveRequest second = req("코일", 2, "다른 의미의 코일");
        second.setEngAbbr("COIL");
        TermSaveResult result = service.save(second);

        assertTrue(result.getWarnings().contains("ENG_ABBR_DUP"), result.getWarnings().toString());
        assertTrue(termRepository.findByTermNameAndSenseNo("코일", 2).isPresent(), "경고여도 저장은 성공해야 한다");
    }

    @Test
    void I8_약어가_없으면_경고가_없다() {
        TermSaveResult result = service.save(req("무약어", 1, "정의"));
        assertTrue(result.getWarnings().isEmpty());
    }

    // ── I12 ──

    @Test
    void I12_인코더_비활성_상태에서_저장해도_성공하고_EMBEDDING이_NULL로_남는다() {
        TermSaveResult saved = service.save(req("임베딩없음", 1, "정의"));
        assertTrue(embeddingRepository.findEmbedding(saved.getTermId()).isEmpty());
    }

    @Test
    void I12_인코더_비활성이면_recommend의_2차_결과가_빈배열이고_stage2Enabled는_false다() {
        RecommendRequest req = new RecommendRequest();
        req.setTermName("아무거나");
        req.setDefinition("정의");
        Map<String, Object> result = service.recommend(req);
        assertEquals(Boolean.FALSE, result.get("stage2Enabled"));
        @SuppressWarnings("unchecked")
        List<Object> candidates = (List<Object>) result.get("candidates");
        boolean hasStage2 = candidates.stream()
                .anyMatch(c -> "2".equals(((com.dongkuk.dmes.mdm.dma.termMng.dto.RecommendCandidate) c).getStage()));
        assertFalse(hasStage2);
    }

    // ── I18 경계값 ──

    @Test
    void I18_표기가_2자_미만이면_1차_추천이_비어있다() {
        service.save(req("가나다", 1, "정의"));
        RecommendRequest req = new RecommendRequest();
        req.setTermName("가"); // 1자
        Map<String, Object> result = service.recommend(req);
        @SuppressWarnings("unchecked")
        List<Object> candidates = (List<Object>) result.get("candidates");
        assertTrue(candidates.isEmpty());
    }

    @Test
    void I18_정확히_일치하면_점수1_0이고_동의어_접미사를_뗀_이름으로도_매치된다() {
        TermSaveRequest batch = req("배치", 1, "ERP 용어");
        batch.setSystems(List.of("ERP"));
        service.save(batch);

        TermSaveRequest existing = req("일괄처리", 2, "이미 등록된 용어");
        existing.setSynonyms(List.of("배치(ERP)"));
        service.save(existing);

        // 지금 새로 등록 중인(termId 없음) 용어의 표기가 "배치" — "일괄처리"의 동의어 "배치(ERP)"
        // 접미사를 뗀 이름과 정확히 일치해야 한다.
        RecommendRequest req = new RecommendRequest();
        req.setTermName("배치");
        Map<String, Object> result = service.recommend(req);
        @SuppressWarnings("unchecked")
        List<com.dongkuk.dmes.mdm.dma.termMng.dto.RecommendCandidate> candidates =
                (List<com.dongkuk.dmes.mdm.dma.termMng.dto.RecommendCandidate> ) (List<?>) result.get("candidates");
        boolean matched = candidates.stream()
                .anyMatch(c -> "일괄처리".equals(c.getTermName()) && c.getScore() == 1.0d);
        assertTrue(matched, candidates.toString());
    }

    @Test
    void I18_편집중인_자기_자신은_후보에서_제외된다() {
        TermSaveResult saved = service.save(req("자기제외", 1, "정의"));
        RecommendRequest req = new RecommendRequest();
        req.setTermId(saved.getTermId());
        req.setTermName("자기제외");
        Map<String, Object> result = service.recommend(req);
        @SuppressWarnings("unchecked")
        List<com.dongkuk.dmes.mdm.dma.termMng.dto.RecommendCandidate> candidates =
                (List<com.dongkuk.dmes.mdm.dma.termMng.dto.RecommendCandidate>) (List<?>) result.get("candidates");
        assertTrue(candidates.stream().noneMatch(c -> c.getTermId().equals(saved.getTermId())));
    }

    // ── I19 ──

    @Test
    void I19_저장_직후_트랜잭션이_없으면_캐시가_즉시_갱신된다() {
        TermSaveResult saved = service.save(req("즉시캐시", 1, "정의"));
        assertNotNull(cache.get(saved.getTermId()));
        assertEquals("즉시캐시", cache.get(saved.getTermId()).termName());
    }

    @Test
    void I19_트랜잭션이_롤백되면_DB에도_캐시에도_남지_않는다() {
        TermSaveRequest req = req("롤백용어", 1, "정의");
        TransactionTemplate tx = new TransactionTemplate(transactionManager);

        assertThrows(RuntimeException.class, () -> tx.execute(status -> {
            service.save(req);
            throw new RuntimeException("강제 롤백");
        }));

        assertTrue(termRepository.findByTermNameAndSenseNo("롤백용어", 1).isEmpty(), "DB 에 남아있으면 안 된다");
        boolean cached = cache.values().stream().anyMatch(c -> "롤백용어".equals(c.termName()));
        assertFalse(cached, "롤백된 저장이 캐시에 유령 항목을 남겼다 — afterCommit 이 아니라 즉시 갱신하는 변이를 의심하라");
    }
}
