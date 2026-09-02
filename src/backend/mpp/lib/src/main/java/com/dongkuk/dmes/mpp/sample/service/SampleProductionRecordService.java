package com.dongkuk.dmes.mpp.sample.service;

import com.dongkuk.dmes.mpp.sample.domain.SampleProductionRecord;
import com.dongkuk.dmes.mpp.sample.dto.SampleProductionRecordCreateRequest;
import com.dongkuk.dmes.mpp.sample.dto.SampleProductionRecordResponse;
import com.dongkuk.dmes.mpp.sample.repository.SampleProductionRecordRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SampleProductionRecordService {

    private final SampleProductionRecordRepository repository;

    @Transactional
    public SampleProductionRecordResponse create(SampleProductionRecordCreateRequest request) {
        SampleProductionRecord saved = repository.save(request.toEntity());
        return SampleProductionRecordResponse.from(saved);
    }

    @Transactional(readOnly = true)
    public List<SampleProductionRecordResponse> findAll() {
        return repository.findAll().stream()
                .map(SampleProductionRecordResponse::from)
                .toList();
    }
}
