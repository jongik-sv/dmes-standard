package com.dongkuk.dmes.cactus.mastercode;

import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;

import java.util.List;
import java.util.Optional;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;

/**
 * {@link DefaultMasterCodeDecoder} 특성 테스트 — Repository 조회 방식과 null 처리.
 */
class DefaultMasterCodeDecoderTest {

    private final MasterCodeItemRepository repository = mock(MasterCodeItemRepository.class);
    private final DefaultMasterCodeDecoder decoder = new DefaultMasterCodeDecoder(repository);

    private static MasterCodeItemEntity item(String itemNm) {
        MasterCodeItemEntity e = mock(MasterCodeItemEntity.class);
        when(e.getItemNm()).thenReturn(itemNm);
        return e;
    }

    @Test
    void decode는_그룹코드_항목코드_순서의_복합키로_조회해_항목명을_돌려준다() {
        MasterCodeItemEntity entity = item("사용");
        when(repository.findById(any())).thenReturn(Optional.of(entity));

        assertThat(decoder.decode("Y", "USE_YN")).isEqualTo("사용");

        ArgumentCaptor<MasterCodeItemId> id = ArgumentCaptor.forClass(MasterCodeItemId.class);
        verify(repository).findById(id.capture());
        assertThat(id.getValue().getGroupCd()).isEqualTo("USE_YN");
        assertThat(id.getValue().getItemCd()).isEqualTo("Y");
        assertThat(id.getValue()).isEqualTo(new MasterCodeItemId("USE_YN", "Y"));
    }

    @Test
    void decode는_항목이_없으면_null이다() {
        when(repository.findById(any())).thenReturn(Optional.empty());

        assertThat(decoder.decode("Z", "USE_YN")).isNull();
    }

    @Test
    void decode는_항목명이_null이면_null이다() {
        MasterCodeItemEntity entity = item(null);
        when(repository.findById(any())).thenReturn(Optional.of(entity));

        assertThat(decoder.decode("Y", "USE_YN")).isNull();
    }

    @Test
    void decode는_값이나_그룹코드가_null이면_조회하지_않고_null이다() {
        assertThat(decoder.decode(null, "USE_YN")).isNull();
        assertThat(decoder.decode("Y", null)).isNull();

        verifyNoInteractions(repository);
    }

    @Test
    void decode는_사용여부와_무관하게_findById로_조회한다() {
        // 현재 동작: decode 는 USE_YN 을 보지 않는다 (isMasterCode 만 활성 항목 기준).
        MasterCodeItemEntity entity = item("미사용항목");
        when(repository.findById(any())).thenReturn(Optional.of(entity));

        assertThat(decoder.decode("X", "G")).isEqualTo("미사용항목");
        verify(repository, never()).findActiveByGroupCd(any());
    }

    @Test
    void isMasterCode는_활성_항목이_하나라도_있으면_true다() {
        MasterCodeItemEntity entity = item("사용");
        when(repository.findActiveByGroupCd("USE_YN")).thenReturn(List.of(entity));

        assertThat(decoder.isMasterCode("USE_YN")).isTrue();
    }

    @Test
    void isMasterCode는_활성_항목이_없으면_false다() {
        when(repository.findActiveByGroupCd("NONE")).thenReturn(List.of());

        assertThat(decoder.isMasterCode("NONE")).isFalse();
    }

    @Test
    void isMasterCode는_null이나_빈_문자열이면_조회하지_않고_false다() {
        assertThat(decoder.isMasterCode(null)).isFalse();
        assertThat(decoder.isMasterCode("")).isFalse();

        verifyNoInteractions(repository);
    }

    @Test
    void isMasterCode는_공백_문자열이면_그대로_조회한다() {
        when(repository.findActiveByGroupCd(" ")).thenReturn(List.of());

        assertThat(decoder.isMasterCode(" ")).isFalse();
        verify(repository).findActiveByGroupCd(" ");
    }
}
