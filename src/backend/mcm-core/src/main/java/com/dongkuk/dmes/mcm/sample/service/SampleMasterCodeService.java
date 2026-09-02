package com.dongkuk.dmes.mcm.sample.service;

import com.dongkuk.dmes.mcm.sample.domain.SampleMasterCode;
import com.dongkuk.dmes.mcm.sample.dto.SampleMasterCodeCreateRequest;
import com.dongkuk.dmes.mcm.sample.dto.SampleMasterCodeResponse;
import com.dongkuk.dmes.mcm.sample.repository.SampleMasterCodeRepository;
import java.util.Comparator;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

@Service
@RequiredArgsConstructor
@Transactional(readOnly = true)
public class SampleMasterCodeService {

    private final SampleMasterCodeRepository sampleMasterCodeRepository;

    @Transactional
    public SampleMasterCodeResponse create(SampleMasterCodeCreateRequest request) {
        SampleMasterCode code = SampleMasterCode.builder()
                .codeGroup(request.codeGroup())
                .codeValue(request.codeValue())
                .label(request.label())
                .sortOrder(request.sortOrder() == null ? 0 : request.sortOrder())
                .useYn(SampleMasterCode.USE_Y)
                .build();
        return SampleMasterCodeResponse.from(sampleMasterCodeRepository.save(code));
    }

    public List<SampleMasterCodeResponse> findActiveByGroup(String codeGroup) {
        return sampleMasterCodeRepository.findByCodeGroupAndUseYn(codeGroup, SampleMasterCode.USE_Y).stream()
                .sorted(Comparator.comparing(SampleMasterCode::getSortOrder))
                .map(SampleMasterCodeResponse::from)
                .toList();
    }
}
