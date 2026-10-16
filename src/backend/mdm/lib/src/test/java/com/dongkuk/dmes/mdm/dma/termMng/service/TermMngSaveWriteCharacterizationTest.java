package com.dongkuk.dmes.mdm.dma.termMng.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.inOrder;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingCodec;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingEncoder;
import com.dongkuk.dmes.mdm.common.embedding.TermEmbeddingRepository;
import com.dongkuk.dmes.mdm.dma.support.TermWriter;
import com.dongkuk.dmes.mdm.dma.support.TermRecommendationCache;
import com.dongkuk.dmes.mdm.dma.termMng.dto.ReencodeBatchRequest;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermDeleteRequest;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermSaveRequest;
import com.dongkuk.dmes.mdm.dma.termMng.dto.TermSaveResult;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.InOrder;
import org.springframework.test.util.ReflectionTestUtils;

/**
 * 용어 관리 저장·삭제의 쓰기 순서 특성 시험(C9 착수 전 고정) — 저장 → (입력이 바뀌면) 임베딩 지우기 → (인코더가 켜져 있으면) 인코딩·갱신 →
 * 캐시 갱신. 트랜잭션 동기화가 없을 때(즉시 경로)만 본다. 커밋 뒤 경로는 {@link TermMngCacheAfterCommitTest} 가 본다.
 */
class TermMngSaveWriteCharacterizationTest {

    private static final Long TERM_ID = 7L;
    /** 인코더 차원(1024)에 맞춘 단위 벡터. */
    private static final float[] VECTOR = unitVector();

    private static float[] unitVector() {
        float[] v = new float[1024];
        v[0] = 1f;
        return v;
    }

    private MdmTermRepository repo;
    private TermEmbeddingRepository embeddings;
    private TermRecommendationCache cache;
    private TermEmbeddingEncoder encoder;
    private TermMngService service;

    @BeforeEach
    void setUp() {
        repo = mock(MdmTermRepository.class);
        embeddings = mock(TermEmbeddingRepository.class);
        cache = mock(TermRecommendationCache.class);
        encoder = mock(TermEmbeddingEncoder.class);
        service = new TermMngService(repo, embeddings, cache, encoder, new TermWriter(repo, embeddings, cache, encoder));
        when(repo.findByTermNameAndSenseNo(anyString(), anyInt())).thenReturn(Optional.empty());
        when(repo.findByEngAbbrIgnoreCase(anyString())).thenReturn(List.of());
        when(repo.saveAndFlush(any(MdmTerm.class))).thenAnswer(inv -> {
            MdmTerm t = inv.getArgument(0);
            if (t.getTermId() == null) {
                ReflectionTestUtils.setField(t, "termId", TERM_ID);
            }
            return t;
        });
        when(encoder.modelId()).thenReturn("m1");
        when(encoder.encode(anyString())).thenReturn(VECTOR);
        when(embeddings.updateEmbedding(anyLong(), any(byte[].class), anyString())).thenReturn(1);
    }

    private static TermSaveRequest req(Long termId, String context) {
        TermSaveRequest r = new TermSaveRequest();
        r.setTermId(termId);
        r.setTermName("편차");
        r.setSenseNo(1);
        r.setDefinition("기준값과의 차이");
        r.setEngName("Deviation");
        r.setEngAbbr("DEV");
        r.setContext(context);
        return r;
    }

    private static MdmTerm term(Long id, String name) {
        MdmTerm t = new MdmTerm(name, 1, "정의 " + name);
        ReflectionTestUtils.setField(t, "termId", id);
        return t;
    }

    private MdmTerm existing() {
        MdmTerm t = new MdmTerm("편차", 1, "기준값과의 차이");
        ReflectionTestUtils.setField(t, "termId", TERM_ID);
        t.setEngName("Deviation");
        t.setEngAbbr("DEV");
        when(repo.findById(TERM_ID)).thenReturn(Optional.of(t));
        return t;
    }

    @Test
    void 새_용어는_저장_뒤_임베딩을_지우고_인코딩해_갱신한_다음_캐시를_갱신한다() {
        when(encoder.isEnabled()).thenReturn(true);

        TermSaveResult result = service.save(req(null, "품질"));

        assertEquals(TERM_ID, result.getTermId());
        assertEquals(List.of(), result.getWarnings());
        InOrder order = inOrder(repo, embeddings, encoder, cache);
        order.verify(repo).saveAndFlush(any(MdmTerm.class));
        order.verify(embeddings).clearEmbedding(TERM_ID);
        order.verify(encoder).encode("편차: 기준값과의 차이 (Deviation)");
        order.verify(embeddings).updateEmbedding(eq(TERM_ID), eq(TermEmbeddingCodec.encode(VECTOR)), eq("m1"));
        order.verify(cache).refresh(TERM_ID);
    }

    @Test
    void 인코더가_꺼져_있으면_임베딩은_지우기만_하고_캐시는_갱신한다() {
        when(encoder.isEnabled()).thenReturn(false);

        service.save(req(null, "품질"));

        verify(embeddings).clearEmbedding(TERM_ID);
        verify(encoder, never()).encode(anyString());
        verify(embeddings, never()).updateEmbedding(anyLong(), any(byte[].class), anyString());
        verify(cache).refresh(TERM_ID);
    }

    @Test
    void 인코딩_입력_세_칸이_그대로면_임베딩을_건드리지_않는다() {
        when(encoder.isEnabled()).thenReturn(true);
        existing();

        service.save(req(TERM_ID, "맥락만 바뀜"));

        verify(repo).saveAndFlush(any(MdmTerm.class));
        verify(embeddings, never()).clearEmbedding(anyLong());
        verify(encoder, never()).encode(anyString());
        verify(cache).refresh(TERM_ID);
    }

    @Test
    void 정의가_바뀌면_기존_용어도_다시_인코딩한다() {
        when(encoder.isEnabled()).thenReturn(true);
        existing().setDefinition("옛 정의");

        service.save(req(TERM_ID, null));

        verify(embeddings).clearEmbedding(TERM_ID);
        verify(encoder).encode("편차: 기준값과의 차이 (Deviation)");
        verify(embeddings).updateEmbedding(eq(TERM_ID), any(byte[].class), eq("m1"));
    }

    @Test
    void 임베딩_갱신이_한_행이_아니면_실패하고_캐시는_갱신하지_않는다() {
        when(encoder.isEnabled()).thenReturn(true);
        when(embeddings.updateEmbedding(anyLong(), any(byte[].class), anyString())).thenReturn(0);

        assertThrows(IllegalStateException.class, () -> service.save(req(null, null)));

        verify(cache, never()).refresh(any());
    }

    @Test
    void 약어가_다른_용어와_겹치면_경고만_내고_저장한다() {
        when(encoder.isEnabled()).thenReturn(false);
        MdmTerm other = new MdmTerm("오차", 1, "정의");
        ReflectionTestUtils.setField(other, "termId", 99L);
        when(repo.findByEngAbbrIgnoreCase("DEV")).thenReturn(List.of(other));

        TermSaveResult result = service.save(req(null, null));

        assertEquals(List.of("ENG_ABBR_DUP"), result.getWarnings());
        verify(repo).saveAndFlush(any(MdmTerm.class));
    }

    @Test
    void 재인코딩_배치는_갱신된_행만_세고_그_행만_캐시를_갱신한다() {
        when(encoder.isEnabled()).thenReturn(true);
        when(embeddings.findStaleTermIds("m1")).thenReturn(List.of(7L, 8L, 9L));
        when(repo.findById(7L)).thenReturn(Optional.of(term(7L, "가")));
        when(repo.findById(8L)).thenReturn(Optional.of(term(8L, "나")));
        when(repo.findById(9L)).thenReturn(Optional.empty()); // 배치 중 지워진 행
        when(embeddings.updateEmbedding(eq(8L), any(byte[].class), eq("m1"))).thenReturn(0);
        ReencodeBatchRequest req = new ReencodeBatchRequest();
        req.setChunkSize(10);

        Map<String, Object> out = service.reencodeBatch(req);

        assertEquals(Map.of("enabled", true, "processed", 1, "remaining", 2, "done", false), out);
        verify(encoder).encode("가: 정의 가");
        verify(cache).refresh(7L);
        verify(cache, never()).refresh(8L);
        verify(cache, never()).refresh(9L);
    }

    @Test
    void 인코더가_꺼져_있으면_재인코딩_배치는_아무_것도_건드리지_않는다() {
        when(encoder.isEnabled()).thenReturn(false);

        Map<String, Object> out = service.reencodeBatch(new ReencodeBatchRequest());

        assertEquals(Map.of("enabled", false, "processed", 0, "remaining", 0, "done", true), out);
        verify(embeddings, never()).findStaleTermIds(anyString());
        verify(cache, never()).refresh(any());
    }

    @Test
    void 삭제는_지운_뒤_캐시에서_뺀다() {
        MdmTerm t = existing();
        TermDeleteRequest del = new TermDeleteRequest();
        del.setTermId(TERM_ID);

        service.delete(del);

        InOrder order = inOrder(repo, cache);
        order.verify(repo).delete(t);
        order.verify(cache).remove(TERM_ID);
    }
}
