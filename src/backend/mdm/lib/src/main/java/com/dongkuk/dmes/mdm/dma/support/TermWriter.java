package com.dongkuk.dmes.mdm.dma.support;

import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingCodec;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingEncoder;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingRepository;
import com.dongkuk.dmes.mdm.dma.termMng.TermRecommendationCache;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * 용어 쓰기 한 곳 — 저장 → (인코딩 입력이 바뀌면) 임베딩 → 커밋 뒤 추천 캐시 갱신(TSK-04-02 I12·I19). 입력 검사·중복 판정·권한은
 * 화면 서비스 몫이고 여기서는 하지 않는다.
 *
 * <p>{@code @Transactional} 을 붙이지 않는다 — 호출하는 OASIS 서비스의 바깥 트랜잭션(BPMN process 단위)에 합류한다.
 */
@Component
public class TermWriter {

    private static final Logger log = LoggerFactory.getLogger(TermWriter.class);

    private final MdmTermRepository termRepository;
    private final TermEmbeddingRepository embeddingRepository;
    private final TermRecommendationCache cache;
    private final TermEmbeddingEncoder encoder;

    public TermWriter(MdmTermRepository termRepository, TermEmbeddingRepository embeddingRepository,
                      TermRecommendationCache cache, TermEmbeddingEncoder encoder) {
        this.termRepository = termRepository;
        this.embeddingRepository = embeddingRepository;
        this.cache = cache;
        this.encoder = encoder;
    }

    /**
     * 저장하고, {@code reencode} 면 임베딩을 먼저 지운 뒤(인코더가 켜져 있으면) 다시 인코딩한다. 캐시는 커밋 뒤에 갱신한다.
     *
     * @param reencode 인코딩 입력(표기·정의·영문명)이 바뀌었거나 새 용어인지(I12)
     * @throws IllegalStateException 임베딩 갱신 대상 행이 하나가 아닐 때
     */
    public MdmTerm save(MdmTerm entity, boolean reencode) {
        // advisor 지적 — JPA insert 가 아직 flush 되지 않으면 뒤이은 네이티브 UPDATE(EMBEDDING)가 0건이 된다.
        MdmTerm saved = termRepository.saveAndFlush(entity);
        Long termId = saved.getTermId();

        if (reencode) {
            // I12 — 먼저 지운다(옛 벡터 + 새 modelId 조합이 남아 I11 을 영영 못 걸리게 하는 사고 방지).
            embeddingRepository.clearEmbedding(termId);
            if (encoder.isEnabled()) {
                float[] vector = encoder.encode(
                        buildEncodingInput(saved.getTermName(), saved.getDefinition(), saved.getEngName()));
                byte[] bytes = TermEmbeddingCodec.encode(vector);
                int updated = embeddingRepository.updateEmbedding(termId, bytes, encoder.modelId());
                if (updated != 1) {
                    throw new IllegalStateException("EMBEDDING 갱신 대상 행이 없다(flush 누락 의심): termId=" + termId);
                }
            }
        }

        afterCommitOrNow("refresh termId=" + termId, () -> cache.refresh(termId));
        return saved;
    }

    /** 지우고 커밋 뒤 캐시에서 뺀다. */
    public void delete(MdmTerm entity) {
        termRepository.delete(entity);
        Long termId = entity.getTermId();
        afterCommitOrNow("remove termId=" + termId, () -> cache.remove(termId));
    }

    /**
     * 재인코딩 배치의 한 행 — 인코딩해 갱신하고, 갱신됐으면 커밋 뒤 캐시를 갱신한다. 인코더가 켜져 있는지는 호출자가 먼저 본다.
     *
     * @return 한 행이 갱신됐는지
     */
    public boolean reencode(MdmTerm term) {
        Long termId = term.getTermId();
        float[] vector = encoder.encode(buildEncodingInput(term.getTermName(), term.getDefinition(), term.getEngName()));
        byte[] bytes = TermEmbeddingCodec.encode(vector);
        int updated = embeddingRepository.updateEmbedding(termId, bytes, encoder.modelId());
        if (updated != 1) {
            return false;
        }
        afterCommitOrNow("refresh termId=" + termId, () -> cache.refresh(termId));
        return true;
    }

    /**
     * I9·I18 — 인코딩 입력 문자열은 {@code "{표기}: {정의} ({영문명})"} 다(term-embedding.md §2, D-025).
     * 값은 strip 하고, 정의가 비면 {@code ": {정의}"}, 영문명이 비면 {@code " ({영문명})"} 를 뺀다.
     */
    public static String buildEncodingInput(String termName, String definition, String engName) {
        StringBuilder sb = new StringBuilder(termName == null ? "" : termName.strip());
        if (definition != null && !definition.isBlank()) {
            sb.append(": ").append(definition.strip());
        }
        if (engName != null && !engName.isBlank()) {
            sb.append(" (").append(engName.strip()).append(')');
        }
        return sb.toString();
    }

    /**
     * I19 — 활성 트랜잭션이 있으면(OASIS 가 BPMN process 단위로 감싼 트랜잭션) 커밋 후로 캐시 갱신을
     * 미룬다. 없으면 즉시 갱신한다. DB 가 롤백됐는데 캐시만 갱신되는 유령 항목을 막는다.
     *
     * <p>두 경로 모두 {@link #runCacheUpdate} 로 감싸 캐시 갱신 실패를 밖으로 내지 않는다.
     *
     * @param what 실패 로그에 남길 갱신 설명(예: {@code "refresh termId=7"})
     */
    private static void afterCommitOrNow(String what, Runnable action) {
        if (TransactionSynchronizationManager.isSynchronizationActive()) {
            TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
                @Override
                public void afterCommit() {
                    runCacheUpdate(what, action);
                }
            });
        } else {
            runCacheUpdate(what, action);
        }
    }

    /**
     * 캐시 갱신을 실행하고 실패({@link RuntimeException})는 삼켜 경고 로그(스택 포함)만 남긴다. {@link Error} 는 잡지 않는다.
     *
     * <p>삼키는 이유 — Spring 은 {@code afterCommit} 예외를 {@code commit()} 호출자에게 그대로 던지고(DB 커밋은 이미 끝남),
     * cactus {@code CactusSpringTransactionHandler.commitAll} 은 이를 커밋 실패로 보고 남은 트랜잭션을 롤백한 뒤 S001 로
     * 응답한다. 그러면 DB 에는 반영된 저장·삭제가 화면에는 실패로 보인다. 같은 트랜잭션의 뒤쪽 {@code afterCommit}
     * (예: 재인코딩 배치의 다른 행 갱신)도 건너뛴다. 트랜잭션이 없을 때의 즉시 경로도 {@code saveAndFlush}·
     * {@code delete} 가 이미 자기 트랜잭션으로 커밋한 뒤라 같은 처지여서 같은 정책을 따른다.
     *
     * <p>로그 수준은 {@code warn} 이다 — {@code ControlTopicPublisher}(DB 가 정본이라 다른 쪽이 나중에 따라잡음, warn) 쪽이고,
     * {@code DmomDispatchSynchronization}(외부 전송분이 사라져 TC_ERROR 로 따로 메워야 함, error) 쪽이 아니다. DB 는 정상이고
     * 잃는 데이터가 없으며 캐시만 낡는다: 저장·재인코딩 실패분은 그 용어를 다음에 저장·재인코딩할 때, 삭제 실패분(지운 용어가
     * 추천 후보에 남음)은 다시 갱신할 길이 없어 다음 전체 재적재({@link TermRecommendationCache#reloadAll}, 부팅 시)까지 남는다.
     */
    private static void runCacheUpdate(String what, Runnable action) {
        try {
            action.run();
        } catch (RuntimeException e) {
            log.warn("[termMng] 캐시 갱신 실패 — {} (DB 는 반영됨, 캐시는 다음 갱신·재적재까지 낡음)", what, e);
        }
    }
}
