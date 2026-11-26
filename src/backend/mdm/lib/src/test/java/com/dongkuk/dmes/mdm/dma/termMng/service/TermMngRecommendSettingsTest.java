package com.dongkuk.dmes.mdm.dma.termMng.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingEncoder;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingRepository;
import com.dongkuk.dmes.mdm.dma.support.TermRecommendationCache;
import com.dongkuk.dmes.mdm.dma.support.TermRecommendationCache.CachedTerm;
import com.dongkuk.dmes.mdm.dma.support.TermWriter;
import com.dongkuk.dmes.mdm.dma.termMng.dto.RecommendCandidate;
import com.dongkuk.dmes.mdm.dma.termMng.dto.RecommendRequest;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import java.util.List;
import java.util.Map;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

/**
 * 유사어 추천 설정 시험 — 추천 개수({@code mdm.recommend.stage1-top-n}·{@code stage2-top-n})와
 * 2차(임베딩) 추천의 최소 유사도({@code mdm.embedding.min-score}). 질의 벡터를 (1,0) 으로 두고 후보 벡터의
 * 첫 성분을 코사인 값으로 써서, 기준값 위·아래 후보가 어떻게 걸러지는지 고정한다.
 */
class TermMngRecommendSettingsTest {

    private MdmTermRepository repo;
    private TermEmbeddingRepository embeddings;
    private TermRecommendationCache cache;
    private TermEmbeddingEncoder encoder;

    @BeforeEach
    void setUp() {
        repo = mock(MdmTermRepository.class);
        embeddings = mock(TermEmbeddingRepository.class);
        cache = mock(TermRecommendationCache.class);
        encoder = mock(TermEmbeddingEncoder.class);
        when(encoder.isEnabled()).thenReturn(true);
        when(encoder.encode(anyString())).thenReturn(new float[] { 1f, 0f });
        when(cache.values()).thenReturn(List.of(
                term(1L, "가나", 0.9f),
                term(2L, "다라", 0.6f),
                term(3L, "마바", 0.2f),
                term(4L, "사아", -0.5f)));
    }

    private static CachedTerm term(Long id, String name, float cosine) {
        float other = (float) Math.sqrt(1 - cosine * cosine);
        return new CachedTerm(id, name, 1, null, List.of(), List.of(), List.of(), new float[] { cosine, other });
    }

    private TermMngService service(double minScore) {
        return service(minScore, TermMngService.DEFAULT_TOP_N, TermMngService.DEFAULT_TOP_N);
    }

    private TermMngService service(double minScore, int stage1TopN, int stage2TopN) {
        return new TermMngService(repo, embeddings, cache, encoder,
                new TermWriter(repo, embeddings, cache, encoder), minScore, stage1TopN, stage2TopN);
    }

    @SuppressWarnings("unchecked")
    private static List<Long> stage1Ids(Map<String, Object> out) {
        return ((List<RecommendCandidate>) out.get("candidates")).stream()
                .filter(c -> "1".equals(c.getStage()))
                .map(RecommendCandidate::getTermId)
                .toList();
    }

    @SuppressWarnings("unchecked")
    private static List<Long> stage2Ids(Map<String, Object> out) {
        return ((List<RecommendCandidate>) out.get("candidates")).stream()
                .filter(c -> "2".equals(c.getStage()))
                .map(RecommendCandidate::getTermId)
                .toList();
    }

    private static RecommendRequest req() {
        RecommendRequest r = new RecommendRequest();
        r.setTermName("질의");
        return r;
    }

    @Test
    void 기본값이면_유사도와_상관없이_모든_후보를_보인다() {
        TermMngService svc = new TermMngService(repo, embeddings, cache, encoder,
                new TermWriter(repo, embeddings, cache, encoder));
        assertEquals(List.of(1L, 2L, 3L, 4L), stage2Ids(svc.recommend(req())));
    }

    @Test
    void 최소_유사도보다_낮은_후보는_버린다() {
        assertEquals(List.of(1L, 2L), stage2Ids(service(0.5).recommend(req())));
    }

    @Test
    void 최소_유사도와_같은_후보는_남긴다() {
        assertEquals(List.of(1L, 2L), stage2Ids(service(0.6f).recommend(req())));
    }

    @Test
    void 범위_밖_값은_기동할_때_거부한다() {
        assertThrows(IllegalStateException.class, () -> service(1.5));
        assertThrows(IllegalStateException.class, () -> service(-1.1));
        assertThrows(IllegalStateException.class, () -> service(Double.NaN));
    }

    @Test
    void 의미_추천_개수를_지정하면_그_건수까지만_보인다() {
        assertEquals(List.of(1L, 2L), stage2Ids(service(-1, 5, 2).recommend(req())));
    }

    @Test
    void 이름_추천_개수를_지정하면_그_건수까지만_보인다() {
        when(cache.values()).thenReturn(List.of(
                term(11L, "질의", 0f),
                term(12L, "질의어", 0f),
                term(13L, "질의서", 0f)));
        assertEquals(List.of(11L), stage1Ids(service(-1, 1, 5).recommend(req())));
        assertEquals(3, stage1Ids(service(-1, 5, 5).recommend(req())).size());
    }

    @Test
    void 요청_파라미터가_오면_서버_설정보다_우선한다() {
        RecommendRequest r = req();
        r.setStage2TopN(3);
        r.setMinScore(0.1);
        // 서버 설정은 2건·0.5 — 요청이 3건·0.1 이라 1·2·3 이 나온다.
        assertEquals(List.of(1L, 2L, 3L), stage2Ids(service(0.5, 5, 2).recommend(r)));
    }

    @Test
    void 요청_파라미터가_비면_서버_설정을_쓴다() {
        assertEquals(List.of(1L), stage2Ids(service(0.5, 5, 1).recommend(req())));
    }

    @Test
    void 요청_파라미터가_범위_밖이면_업무_오류로_거부한다() {
        RecommendRequest topN = req();
        topN.setStage1TopN(0);
        assertThrows(BusinessException.class, () -> service(-1).recommend(topN));
        RecommendRequest score = req();
        score.setMinScore(1.5);
        assertThrows(BusinessException.class, () -> service(-1).recommend(score));
    }

    @Test
    void 추천_개수가_범위_밖이면_기동할_때_거부한다() {
        assertThrows(IllegalStateException.class, () -> service(-1, 0, 5));
        assertThrows(IllegalStateException.class, () -> service(-1, 5, TermMngService.MAX_TOP_N + 1));
    }
}
