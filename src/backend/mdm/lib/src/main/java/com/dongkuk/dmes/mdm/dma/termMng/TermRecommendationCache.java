package com.dongkuk.dmes.mdm.dma.termMng;

import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingRepository;
import com.dongkuk.dmes.mdm.common.support.MdmJsonLists;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import java.util.Collection;
import java.util.List;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.event.EventListener;
import org.springframework.stereotype.Component;

/**
 * 용어 추천 인메모리 캐시 — 불변 규칙 I19. {@code termId → CachedTerm}. 1차·2차 추천이 매 요청 DB 를
 * 훑지 않게 하는 성능 전제(AC7).
 *
 * <p>{@link ApplicationReadyEvent} 리스너에서 전체 적재한다 — {@code @PostConstruct} 가 아니다. 부팅
 * 초기에는 Flyway 마이그레이션이 아직 끝나지 않았을 수 있어 그 시점의 JDBC 조회가 부팅 자체를 실패시킬
 * 위험이 있다(design.md §2).
 */
@Component
public class TermRecommendationCache {

    private static final Logger log = LoggerFactory.getLogger(TermRecommendationCache.class);
    /** JSON 목록 파싱 실패 경고 로그 앞머리. */
    private static final String LOG_LABEL = "TermRecommendationCache";

    /** 캐시 항목 — 1차(문자열)·2차(임베딩) 추천이 참조하는 스냅샷. */
    public record CachedTerm(
            Long termId, String termName, int senseNo, String engName,
            List<String> synonyms, List<String> aliases, List<String> systems, float[] embedding) {
    }

    private final MdmTermRepository termRepository;
    private final TermEmbeddingRepository embeddingRepository;

    private volatile Map<Long, CachedTerm> cache = new ConcurrentHashMap<>();

    public TermRecommendationCache(MdmTermRepository termRepository, TermEmbeddingRepository embeddingRepository) {
        this.termRepository = termRepository;
        this.embeddingRepository = embeddingRepository;
    }

    @EventListener(ApplicationReadyEvent.class)
    public void onApplicationReady() {
        reloadAll();
    }

    /** 전체 재적재 — 부팅 시 리스너, 그리고 성능 시험이 JDBC 배치 insert 뒤 직접 부른다(§3.2). */
    public void reloadAll() {
        Map<Long, float[]> embeddings = embeddingRepository.loadAllEmbeddings();
        Map<Long, CachedTerm> next = new ConcurrentHashMap<>();
        for (MdmTerm term : termRepository.findAll()) {
            next.put(term.getTermId(), toCachedTerm(term, embeddings.get(term.getTermId())));
        }
        this.cache = next;
        log.info("[TermRecommendationCache] 전체 재적재 — {}건", next.size());
    }

    /** 저장(save)·재인코딩 후 해당 행만 갱신한다(I19 — 전체 재적재 금지). */
    public void refresh(Long termId) {
        termRepository.findById(termId).ifPresentOrElse(
                term -> cache.put(termId, toCachedTerm(term, embeddingRepository.findEmbedding(termId).orElse(null))),
                () -> cache.remove(termId));
    }

    /** 삭제 후 캐시에서 제거한다. */
    public void remove(Long termId) {
        cache.remove(termId);
    }

    public Collection<CachedTerm> values() {
        return cache.values();
    }

    public CachedTerm get(Long termId) {
        return cache.get(termId);
    }

    private CachedTerm toCachedTerm(MdmTerm term, float[] embedding) {
        return new CachedTerm(
                term.getTermId(), term.getTermName(), term.getSenseNo(), term.getEngName(),
                MdmJsonLists.readStrings(term.getSynonyms(), LOG_LABEL),
                MdmJsonLists.readStrings(term.getAliases(), LOG_LABEL),
                MdmJsonLists.readStrings(term.getSystems(), LOG_LABEL), embedding);
    }
}
