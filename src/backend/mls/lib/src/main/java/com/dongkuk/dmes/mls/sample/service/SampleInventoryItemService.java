package com.dongkuk.dmes.mls.sample.service;

import com.dongkuk.dmes.mls.sample.domain.SampleInventoryItem;
import com.dongkuk.dmes.mls.sample.dto.SampleInventoryItemCreateRequest;
import com.dongkuk.dmes.mls.sample.dto.SampleInventoryItemResponse;
import com.dongkuk.dmes.mls.sample.repository.SampleInventoryItemRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SampleInventoryItemService {

    private final SampleInventoryItemRepository repository;

    @Transactional
    public SampleInventoryItemResponse create(SampleInventoryItemCreateRequest request) {
        SampleInventoryItem saved = repository.save(request.toEntity());
        return SampleInventoryItemResponse.from(saved);
    }

    @Transactional(readOnly = true)
    public List<SampleInventoryItemResponse> findAll() {
        return repository.findAll().stream()
                .map(SampleInventoryItemResponse::from)
                .toList();
    }
}
