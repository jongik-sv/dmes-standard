package com.dongkuk.dmes.mpp.sample.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;

import com.dongkuk.dmes.mpp.sample.domain.SampleProductionRecord;
import com.dongkuk.dmes.mpp.sample.dto.SampleProductionRecordCreateRequest;
import com.dongkuk.dmes.mpp.sample.dto.SampleProductionRecordResponse;
import com.dongkuk.dmes.mpp.sample.repository.SampleProductionRecordRepository;
import java.math.BigDecimal;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SampleProductionRecordServiceTest {

    @Mock
    private SampleProductionRecordRepository repository;

    @InjectMocks
    private SampleProductionRecordService service;

    private SampleProductionRecordCreateRequest sampleRequest() {
        return new SampleProductionRecordCreateRequest(
                "WO-001",
                new BigDecimal("100"),
                new BigDecimal("2"),
                LocalDateTime.of(2026, 1, 1, 18, 0)
        );
    }

    @Test
    @DisplayName("생성 요청을 저장하고 저장 결과를 응답으로 변환한다")
    void create() {
        given(repository.save(any(SampleProductionRecord.class))).willAnswer(invocation -> invocation.getArgument(0));

        SampleProductionRecordResponse response = service.create(sampleRequest());

        assertThat(response.workOrderNo()).isEqualTo("WO-001");
        then(repository).should().save(any(SampleProductionRecord.class));
    }

    @Test
    @DisplayName("전체 조회 결과를 응답 목록으로 변환한다")
    void findAll() {
        given(repository.findAll()).willReturn(List.of(sampleRequest().toEntity()));

        List<SampleProductionRecordResponse> responses = service.findAll();

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).workOrderNo()).isEqualTo("WO-001");
    }
}
