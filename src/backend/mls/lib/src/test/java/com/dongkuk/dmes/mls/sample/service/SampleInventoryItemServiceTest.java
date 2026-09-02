package com.dongkuk.dmes.mls.sample.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;

import com.dongkuk.dmes.mls.sample.domain.SampleInventoryItem;
import com.dongkuk.dmes.mls.sample.dto.SampleInventoryItemCreateRequest;
import com.dongkuk.dmes.mls.sample.dto.SampleInventoryItemResponse;
import com.dongkuk.dmes.mls.sample.repository.SampleInventoryItemRepository;
import java.math.BigDecimal;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SampleInventoryItemServiceTest {

    @Mock
    private SampleInventoryItemRepository repository;

    @InjectMocks
    private SampleInventoryItemService service;

    private SampleInventoryItemCreateRequest sampleRequest() {
        return new SampleInventoryItemCreateRequest(
                "ITEM-001",
                "샘플 품목",
                new BigDecimal("10.5"),
                "A-01"
        );
    }

    @Test
    @DisplayName("생성 요청을 저장하고 저장 결과를 응답으로 변환한다")
    void create() {
        given(repository.save(any(SampleInventoryItem.class))).willAnswer(invocation -> invocation.getArgument(0));

        SampleInventoryItemResponse response = service.create(sampleRequest());

        assertThat(response.itemCode()).isEqualTo("ITEM-001");
        then(repository).should().save(any(SampleInventoryItem.class));
    }

    @Test
    @DisplayName("전체 조회 결과를 응답 목록으로 변환한다")
    void findAll() {
        given(repository.findAll()).willReturn(List.of(sampleRequest().toEntity()));

        List<SampleInventoryItemResponse> responses = service.findAll();

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).itemCode()).isEqualTo("ITEM-001");
    }
}
