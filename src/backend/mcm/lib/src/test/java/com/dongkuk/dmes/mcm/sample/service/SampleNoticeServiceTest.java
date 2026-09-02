package com.dongkuk.dmes.mcm.sample.service;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.BDDMockito.given;
import static org.mockito.BDDMockito.then;

import com.dongkuk.dmes.mcm.sample.domain.SampleNotice;
import com.dongkuk.dmes.mcm.sample.dto.SampleNoticeCreateRequest;
import com.dongkuk.dmes.mcm.sample.dto.SampleNoticeResponse;
import com.dongkuk.dmes.mcm.sample.repository.SampleNoticeRepository;
import java.util.List;
import org.junit.jupiter.api.DisplayName;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

@ExtendWith(MockitoExtension.class)
class SampleNoticeServiceTest {

    @Mock
    private SampleNoticeRepository repository;

    @InjectMocks
    private SampleNoticeService service;

    private SampleNoticeCreateRequest sampleRequest() {
        return new SampleNoticeCreateRequest(
                "공지 제목",
                "공지 본문",
                true
        );
    }

    @Test
    @DisplayName("생성 요청을 저장하고 저장 결과를 응답으로 변환한다")
    void create() {
        given(repository.save(any(SampleNotice.class))).willAnswer(invocation -> invocation.getArgument(0));

        SampleNoticeResponse response = service.create(sampleRequest());

        assertThat(response.title()).isEqualTo("공지 제목");
        then(repository).should().save(any(SampleNotice.class));
    }

    @Test
    @DisplayName("전체 조회 결과를 응답 목록으로 변환한다")
    void findAll() {
        given(repository.findAll()).willReturn(List.of(sampleRequest().toEntity()));

        List<SampleNoticeResponse> responses = service.findAll();

        assertThat(responses).hasSize(1);
        assertThat(responses.get(0).title()).isEqualTo("공지 제목");
    }
}
