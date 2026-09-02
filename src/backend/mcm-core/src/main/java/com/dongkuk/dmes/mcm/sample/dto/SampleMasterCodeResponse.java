package com.dongkuk.dmes.mcm.sample.dto;

import com.dongkuk.dmes.mcm.sample.domain.SampleMasterCode;

public record SampleMasterCodeResponse(
        Long id,
        String codeGroup,
        String codeValue,
        String label,
        Integer sortOrder,
        String useYn
) {

    public static SampleMasterCodeResponse from(SampleMasterCode code) {
        return new SampleMasterCodeResponse(
                code.getId(),
                code.getCodeGroup(),
                code.getCodeValue(),
                code.getLabel(),
                code.getSortOrder(),
                code.getUseYn()
        );
    }
}
