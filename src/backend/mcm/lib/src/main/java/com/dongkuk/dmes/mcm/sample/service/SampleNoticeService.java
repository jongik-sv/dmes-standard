package com.dongkuk.dmes.mcm.sample.service;

import com.dongkuk.dmes.mcm.sample.domain.SampleNotice;
import com.dongkuk.dmes.mcm.sample.dto.SampleNoticeCreateRequest;
import com.dongkuk.dmes.mcm.sample.dto.SampleNoticeResponse;
import com.dongkuk.dmes.mcm.sample.repository.SampleNoticeRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SampleNoticeService {

    private final SampleNoticeRepository repository;

    @Transactional
    public SampleNoticeResponse create(SampleNoticeCreateRequest request) {
        SampleNotice saved = repository.save(request.toEntity());
        return SampleNoticeResponse.from(saved);
    }

    @Transactional(readOnly = true)
    public List<SampleNoticeResponse> findAll() {
        return repository.findAll().stream()
                .map(SampleNoticeResponse::from)
                .toList();
    }
}
