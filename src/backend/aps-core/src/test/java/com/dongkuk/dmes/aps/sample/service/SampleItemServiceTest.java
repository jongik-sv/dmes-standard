package com.dongkuk.dmes.aps.sample.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.Mockito.verify;

import com.dongkuk.dmes.aps.sample.domain.SampleItem;
import com.dongkuk.dmes.aps.sample.dto.SampleItemCreateRequest;
import com.dongkuk.dmes.aps.sample.dto.SampleItemResponse;
import com.dongkuk.dmes.aps.sample.repository.SampleItemRepository;
import java.time.LocalDateTime;
import java.util.NoSuchElementException;
import java.util.Optional;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SampleItemServiceTest {

    @Mock
    private SampleItemRepository sampleItemRepository;

    @InjectMocks
    private SampleItemService sampleItemService;

    @Test
    @DisplayName("status 를 생략하면 ACTIVE 로 저장한다")
    void createAppliesDefaultStatus() {
        given(sampleItemRepository.save(any(SampleItem.class))).willAnswer(call -> call.getArgument(0));

        SampleItemResponse response = sampleItemService.create(new SampleItemCreateRequest("ITEM-001", "샘플 품목", null));

        ArgumentCaptor<SampleItem> captor = ArgumentCaptor.forClass(SampleItem.class);
        verify(sampleItemRepository).save(captor.capture());
        assertThat(captor.getValue().getCreatedAt()).isNotNull();
        assertThat(response.code()).isEqualTo("ITEM-001");
        assertThat(response.status()).isEqualTo("ACTIVE");
    }

    @Test
    @DisplayName("코드로 조회하면 해당 품목을 반환한다")
    void findByCodeReturnsItem() {
        SampleItem item = SampleItem.builder()
                .id(1L)
                .code("ITEM-001")
                .name("샘플 품목")
                .status("ACTIVE")
                .createdAt(LocalDateTime.now())
                .build();
        given(sampleItemRepository.findByCode("ITEM-001")).willReturn(Optional.of(item));

        assertThat(sampleItemService.findByCode("ITEM-001").name()).isEqualTo("샘플 품목");
    }

    @Test
    @DisplayName("없는 코드로 조회하면 예외를 던진다")
    void findByCodeThrowsWhenMissing() {
        given(sampleItemRepository.findByCode("NONE")).willReturn(Optional.empty());

        assertThatThrownBy(() -> sampleItemService.findByCode("NONE"))
                .isInstanceOf(NoSuchElementException.class)
                .hasMessageContaining("NONE");
    }
}
