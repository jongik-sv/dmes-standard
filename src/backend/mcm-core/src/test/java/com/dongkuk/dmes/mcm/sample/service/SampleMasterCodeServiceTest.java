package com.dongkuk.dmes.mcm.sample.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;

import com.dongkuk.dmes.mcm.sample.domain.SampleMasterCode;
import com.dongkuk.dmes.mcm.sample.dto.SampleMasterCodeCreateRequest;
import com.dongkuk.dmes.mcm.sample.dto.SampleMasterCodeResponse;
import com.dongkuk.dmes.mcm.sample.repository.SampleMasterCodeRepository;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SampleMasterCodeServiceTest {

    @Mock
    private SampleMasterCodeRepository sampleMasterCodeRepository;

    @InjectMocks
    private SampleMasterCodeService sampleMasterCodeService;

    @Test
    @DisplayName("생성하면 사용여부 Y 로 저장하고 sortOrder 누락 시 0 을 적용한다")
    void createAppliesDefaults() {
        given(sampleMasterCodeRepository.save(any(SampleMasterCode.class))).willAnswer(call -> call.getArgument(0));

        SampleMasterCodeResponse response = sampleMasterCodeService.create(
                new SampleMasterCodeCreateRequest("ORDER_STATUS", "OPEN", "접수", null));

        assertThat(response.useYn()).isEqualTo("Y");
        assertThat(response.sortOrder()).isZero();
        assertThat(response.codeGroup()).isEqualTo("ORDER_STATUS");
    }

    @Test
    @DisplayName("그룹 조회는 사용중인 코드만 sortOrder 순으로 반환한다")
    void findActiveByGroupSortsBySortOrder() {
        given(sampleMasterCodeRepository.findByCodeGroupAndUseYn("ORDER_STATUS", "Y"))
                .willReturn(List.of(
                        code("CLOSED", "마감", 2),
                        code("OPEN", "접수", 1)));

        List<SampleMasterCodeResponse> result = sampleMasterCodeService.findActiveByGroup("ORDER_STATUS");

        assertThat(result).extracting(SampleMasterCodeResponse::codeValue).containsExactly("OPEN", "CLOSED");
    }

    private SampleMasterCode code(String codeValue, String label, int sortOrder) {
        return SampleMasterCode.builder()
                .codeGroup("ORDER_STATUS")
                .codeValue(codeValue)
                .label(label)
                .sortOrder(sortOrder)
                .useYn("Y")
                .build();
    }
}
