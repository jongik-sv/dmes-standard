package com.dongkuk.dmes.mpn.sample.service;

import com.dongkuk.dmes.mpn.sample.domain.SampleWorkOrder;
import com.dongkuk.dmes.mpn.sample.dto.SampleWorkOrderCreateRequest;
import com.dongkuk.dmes.mpn.sample.dto.SampleWorkOrderResponse;
import com.dongkuk.dmes.mpn.sample.repository.SampleWorkOrderRepository;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
public class SampleWorkOrderService {

    private final SampleWorkOrderRepository repository;

    @Transactional
    public SampleWorkOrderResponse create(SampleWorkOrderCreateRequest request) {
        SampleWorkOrder saved = repository.save(request.toEntity());
        return SampleWorkOrderResponse.from(saved);
    }

    @Transactional(readOnly = true)
    public List<SampleWorkOrderResponse> findAll() {
        return repository.findAll().stream()
                .map(SampleWorkOrderResponse::from)
                .toList();
    }
}
