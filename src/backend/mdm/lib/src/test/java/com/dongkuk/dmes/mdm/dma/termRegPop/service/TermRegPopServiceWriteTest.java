package com.dongkuk.dmes.mdm.dma.termRegPop.service;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import com.dongkuk.dmes.cactus.common.BusinessException;
import com.dongkuk.dmes.mdm.common.security.MdmStdAdminGuard;
import com.dongkuk.dmes.mdm.contract.common.MdmErrorCode;
import com.dongkuk.dmes.mdm.dma.support.TermWriter;
import com.dongkuk.dmes.mdm.dma.termRegPop.dto.TermRegPopRegRequest;
import com.dongkuk.dmes.mdm.entity.MdmTerm;
import com.dongkuk.dmes.mdm.repository.MdmTermRepository;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.test.util.ReflectionTestUtils;

/** 용어 인라인 등록은 검사를 모두 통과한 뒤에만 {@link TermWriter} 로 저장한다(F3 — 임베딩·커밋 뒤 캐시를 용어 관리와 같게). */
class TermRegPopServiceWriteTest {

    private MdmTermRepository repo;
    private TermWriter writer;
    private TermRegPopService service;

    @BeforeEach
    void setUp() {
        repo = mock(MdmTermRepository.class);
        writer = mock(TermWriter.class);
        service = new TermRegPopService(repo, mock(MdmStdAdminGuard.class), writer);
        when(repo.existsByTermNameAndSenseNo(anyString(), anyInt())).thenReturn(false);
        when(repo.findAll()).thenReturn(List.of());
        when(writer.save(any(MdmTerm.class), anyBoolean())).thenAnswer(inv -> {
            MdmTerm t = inv.getArgument(0);
            ReflectionTestUtils.setField(t, "termId", 7L);
            return t;
        });
    }

    private static TermRegPopRegRequest valid() {
        TermRegPopRegRequest req = new TermRegPopRegRequest();
        req.setTermName("편차");
        req.setSenseNo(1);
        req.setDefinition("기준값과의 차이");
        req.setEngName("Deviation");
        req.setEngAbbr("DEV");
        return req;
    }

    @Test
    void 새_용어는_인코딩_대상으로_TermWriter_에_저장한다() {
        service.reg(valid());

        ArgumentCaptor<MdmTerm> saved = ArgumentCaptor.forClass(MdmTerm.class);
        verify(writer).save(saved.capture(), eq(true));
        assertEquals("편차", saved.getValue().getTermName());
        assertEquals("DEV", saved.getValue().getEngAbbr());
        assertEquals(TermRegPopService.SRC_ORIGIN, saved.getValue().getSrcOrigin());
        verify(repo, never()).save(any(MdmTerm.class));
    }

    @Test
    void 검사에_걸리면_저장하지_않는다() {
        TermRegPopRegRequest bad = valid();
        bad.setEngAbbr("dev");

        assertThrows(BusinessException.class, () -> service.reg(bad));

        verify(writer, never()).save(any(MdmTerm.class), anyBoolean());
    }

    @Test
    void 약어가_대소문자만_다르게_이미_있으면_MDM020_으로_거부하고_저장하지_않는다() {
        MdmTerm other = new MdmTerm("오차", 1, "정의");
        other.setEngAbbr("dev");
        when(repo.findAll()).thenReturn(List.of(other));

        BusinessException e = assertThrows(BusinessException.class, () -> service.reg(valid()));

        assertEquals(MdmErrorCode.TERM_DUPLICATED.code(), e.getErrors().get(0).code(), e.getMessage());
        verify(writer, never()).save(any(MdmTerm.class), anyBoolean());
    }
}
