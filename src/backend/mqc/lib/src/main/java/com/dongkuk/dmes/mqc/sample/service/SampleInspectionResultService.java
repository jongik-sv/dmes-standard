package com.dongkuk.dmes.mqc.sample.service;

import com.dongkuk.dmes.mqc.sample.domain.SampleInspectionResult;
import com.dongkuk.dmes.mqc.sample.dto.SampleInspectionResultCreateRequest;
import com.dongkuk.dmes.mqc.sample.dto.SampleInspectionResultResponse;
import com.dongkuk.dmes.mqc.sample.repository.SampleInspectionResultRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SampleInspectionResultService {

    private final SampleInspectionResultRepository repository;

    @Transactional
    public SampleInspectionResultResponse create(SampleInspectionResultCreateRequest request) {
        SampleInspectionResult saved = repository.save(request.toEntity());
        return SampleInspectionResultResponse.from(saved);
    }

    @Transactional(readOnly = true)
    public List<SampleInspectionResultResponse> findAll() {
        return repository.findAll().stream()
                .map(SampleInspectionResultResponse::from)
                .toList();
    }
}
