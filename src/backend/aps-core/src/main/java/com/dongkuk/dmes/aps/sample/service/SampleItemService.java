package com.dongkuk.dmes.aps.sample.service;

import com.dongkuk.dmes.aps.sample.domain.SampleItem;
import com.dongkuk.dmes.aps.sample.dto.SampleItemCreateRequest;
import com.dongkuk.dmes.aps.sample.dto.SampleItemResponse;
import com.dongkuk.dmes.aps.sample.repository.SampleItemRepository;
import java.time.LocalDateTime;
import java.util.List;
import java.util.NoSuchElementException;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SampleItemService {

    private static final String DEFAULT_STATUS = "ACTIVE";

    private final SampleItemRepository sampleItemRepository;

    @Transactional
    public SampleItemResponse create(SampleItemCreateRequest request) {
        SampleItem item = SampleItem.builder()
                .code(request.code())
                .name(request.name())
                .status(request.status() == null ? DEFAULT_STATUS : request.status())
                .createdAt(LocalDateTime.now())
                .build();
        return SampleItemResponse.from(sampleItemRepository.save(item));
    }

    public List<SampleItemResponse> findAll() {
        return sampleItemRepository.findAll().stream()
                .map(SampleItemResponse::from)
                .toList();
    }

    public SampleItemResponse findByCode(String code) {
        return sampleItemRepository.findByCode(code)
                .map(SampleItemResponse::from)
                .orElseThrow(() -> new NoSuchElementException("샘플 품목을 찾을 수 없습니다: " + code));
    }
}
