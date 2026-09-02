package com.dongkuk.dmes.mpn.sample.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;

import com.dongkuk.dmes.mpn.sample.domain.SampleWorkOrder;
import com.dongkuk.dmes.mpn.sample.dto.SampleWorkOrderCreateRequest;
import com.dongkuk.dmes.mpn.sample.dto.SampleWorkOrderResponse;
import com.dongkuk.dmes.mpn.sample.repository.SampleWorkOrderRepository;
import com.dongkuk.dmes.mpn.sample.domain.WorkOrderStatus;
import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SampleWorkOrderServiceTest {

    @Mock
    private SampleWorkOrderRepository repository;

    @InjectMocks
    private SampleWorkOrderService service;

    private SampleWorkOrderCreateRequest sampleRequest() {
        return new SampleWorkOrderCreateRequest(
                "WO-2026-001",
                "ITEM-001",
                new BigDecimal("50"),
                LocalDate.of(2026, 3, 1),
                WorkOrderStatus.PLANNED
        );
    }

    @Test
    @DisplayName("생성 요청을 저장하고 저장 결과를 응답으로 변환한다")
    void create() {
        given(repository.save(any(SampleWorkOrder.class))).willAnswer(invocation -> invocation.getArgument(0));

        SampleWorkOrderResponse response = service.create(sampleRequest());

        assertThat(response.orderNo()).isEqualTo("WO-2026-001");
        then(repository).should().save(any(SampleWorkOrder.class));
    }

    @Test
    @DisplayName("전체 조회 결과를 응답 목록으로 변환한다")
    void findAll() {
        given(repository.findAll()).willReturn(List.of(sampleRequest().toEntity()));

        List<SampleWorkOrderResponse> responses = service.findAll();

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).orderNo()).isEqualTo("WO-2026-001");
    }
}
