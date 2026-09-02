package com.dongkuk.dmes.mqc.sample.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;

import com.dongkuk.dmes.mqc.sample.domain.SampleInspectionResult;
import com.dongkuk.dmes.mqc.sample.dto.SampleInspectionResultCreateRequest;
import com.dongkuk.dmes.mqc.sample.dto.SampleInspectionResultResponse;
import com.dongkuk.dmes.mqc.sample.repository.SampleInspectionResultRepository;
import com.dongkuk.dmes.mqc.sample.domain.InspectionJudgement;
import java.time.LocalDateTime;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SampleInspectionResultServiceTest {

    @Mock
    private SampleInspectionResultRepository repository;

    @InjectMocks
    private SampleInspectionResultService service;

    private SampleInspectionResultCreateRequest sampleRequest() {
        return new SampleInspectionResultCreateRequest(
                "LOT-001",
                LocalDateTime.of(2026, 1, 1, 9, 0),
                InspectionJudgement.PASS,
                "비고"
        );
    }

    @Test
    @DisplayName("생성 요청을 저장하고 저장 결과를 응답으로 변환한다")
    void create() {
        given(repository.save(any(SampleInspectionResult.class))).willAnswer(invocation -> invocation.getArgument(0));

        SampleInspectionResultResponse response = service.create(sampleRequest());

        assertThat(response.lotNo()).isEqualTo("LOT-001");
        then(repository).should().save(any(SampleInspectionResult.class));
    }

    @Test
    @DisplayName("전체 조회 결과를 응답 목록으로 변환한다")
    void findAll() {
        given(repository.findAll()).willReturn(List.of(sampleRequest().toEntity()));

        List<SampleInspectionResultResponse> responses = service.findAll();

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).lotNo()).isEqualTo("LOT-001");
    }
}
