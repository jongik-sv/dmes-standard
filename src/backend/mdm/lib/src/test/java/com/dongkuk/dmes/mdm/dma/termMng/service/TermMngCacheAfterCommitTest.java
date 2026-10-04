package com.dongkuk.dmes.mdm.dma.termMng.service;

import static org.junit.jupiter.api.Assertions.assertDoesNotThrow;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertFalse;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingEncoder;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingRepository;
import com.dongkuk.dmes.mdm.dma.termMng.TermRecommendationCache;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermDeleteRequest;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermSaveRequest;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermSaveResult;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import java.util.List;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;

/**
 * I19 커밋 뒤 캐시 갱신 실패 재현 시험 — 캐시 갱신({@code refresh}·{@code remove})이 예외를 던져도 저장·삭제가 실패로
 * 보이지 않아야 한다.
 *
 * <p>Spring 은 {@code afterCommit} 예외를 {@code commit()} 호출자에게 그대로 던지고(DB 커밋은 이미 끝남), cactus
 * {@code CactusSpringTransactionHandler.commitAll} 은 이를 커밋 실패로 보고 응답을 S001 로 낸다. 그래서 DB 에는 반영됐는데
 * 화면은 실패로 보였다. OASIS 경로 전체 대신 서비스 단위로 고정한다 — 트랜잭션 동기화만 켜고 등록된 동기화의
 * {@code afterCommit} 을 직접 부른다. 캐시는 예외를 던지는 시험 대역(mock)이다.
 */
class TermMngCacheAfterCommitTest {

    /** {@code Long} 으로 둔다 — DTO·캐시 시그니처가 {@code Long} 이라 assertEquals·스텁 인자가 박싱 모호성 없이 맞는다. */
    private static final Long TERM_ID = 7L;

    private MdmTermRepository repo;
    private TermRecommendationCache cache;
    private TermMngService service;

    @BeforeEach
    void setUp() {
        repo = mock(MdmTermRepository.class);
        cache = mock(TermRecommendationCache.class);
        service = new TermMngService(repo, mock(TermEmbeddingRepository.class), cache,
                mock(TermEmbeddingEncoder.class)); // 인코더 mock — isEnabled()=false 라 임베딩 경로는 지우기만 한다
        // saveAndFlush 가 ID 를 채운 것처럼 돌려준다(ID 가 null 이면 refresh(null) 이라 대역의 예외 스텁이 맞지 않는다).
        when(repo.saveAndFlush(any(MdmTerm.class))).thenAnswer(inv -> {
            MdmTerm t = inv.getArgument(0);
            ReflectionTestUtils.setField(t, "termId", TERM_ID);
            return t;
        });
        doThrow(new IllegalStateException("캐시 갱신 실패(시험)")).when(cache).refresh(eq(TERM_ID));
        doThrow(new IllegalStateException("캐시 제거 실패(시험)")).when(cache).remove(eq(TERM_ID));
    }

    private static TermSaveRequest saveReq() {
        TermSaveRequest r = new TermSaveRequest();
        r.setTermName("캐시실패");
        r.setSenseNo(1);
        r.setDefinition("정의");
        return r;
    }

    @Test
    void 커밋_뒤_캐시_refresh_가_예외를_던져도_afterCommit_은_예외를_밖으로_내지_않는다() {
        TransactionSynchronizationManager.initSynchronization();
        try {
            TermSaveResult result = service.save(saveReq());
            assertEquals(TERM_ID, result.getTermId());

            // 즉시 경로가 아니라 커밋 뒤로 미룬 경로를 시험하고 있음을 먼저 확인한다.
            List<TransactionSynchronization> syncs = TransactionSynchronizationManager.getSynchronizations();
            assertEquals(1, syncs.size(), "커밋 뒤 캐시 갱신 동기화가 하나 등록돼야 한다");
            verify(cache, never()).refresh(any());

            assertDoesNotThrow(() -> syncs.forEach(TransactionSynchronization::afterCommit),
                    "캐시 갱신 실패가 commit() 호출자에게 번지면 OASIS 가 커밋 실패(S001)로 응답한다");
            verify(cache).refresh(TERM_ID);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void 커밋_뒤_캐시_remove_가_예외를_던져도_afterCommit_은_예외를_밖으로_내지_않는다() {
        MdmTerm existing = new MdmTerm("삭제대상", 1, "정의");
        ReflectionTestUtils.setField(existing, "termId", TERM_ID);
        when(repo.findById(TERM_ID)).thenReturn(Optional.of(existing));
        TermDeleteRequest del = new TermDeleteRequest();
        del.setTermId(TERM_ID);

        TransactionSynchronizationManager.initSynchronization();
        try {
            service.delete(del);

            List<TransactionSynchronization> syncs = TransactionSynchronizationManager.getSynchronizations();
            assertEquals(1, syncs.size(), "커밋 뒤 캐시 제거 동기화가 하나 등록돼야 한다");
            verify(cache, never()).remove(any());

            assertDoesNotThrow(() -> syncs.forEach(TransactionSynchronization::afterCommit));
            verify(cache).remove(TERM_ID);
        } finally {
            TransactionSynchronizationManager.clearSynchronization();
        }
    }

    @Test
    void 트랜잭션이_없을_때_즉시_캐시_갱신이_실패해도_저장은_성공으로_끝난다() {
        // 트랜잭션 동기화가 없으면 saveAndFlush 가 자기 트랜잭션으로 이미 커밋했다 — 커밋 뒤와 같은 처지라 같은 정책을 따른다.
        assertFalse(TransactionSynchronizationManager.isSynchronizationActive());

        TermSaveResult result = assertDoesNotThrow(() -> service.save(saveReq()));

        assertNotNull(result);
        assertEquals(TERM_ID, result.getTermId());
        verify(cache).refresh(TERM_ID);
    }
}
