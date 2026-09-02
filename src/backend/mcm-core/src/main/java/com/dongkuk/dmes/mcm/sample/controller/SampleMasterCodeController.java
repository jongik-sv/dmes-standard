package com.dongkuk.dmes.mcm.sample.controller;

import com.dongkuk.dmes.mcm.sample.dto.SampleMasterCodeCreateRequest;
import com.dongkuk.dmes.mcm.sample.dto.SampleMasterCodeResponse;
import com.dongkuk.dmes.mcm.sample.service.SampleMasterCodeService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/mcm/sample-master-codes")
@RequiredArgsConstructor
public class SampleMasterCodeController {

    private final SampleMasterCodeService sampleMasterCodeService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SampleMasterCodeResponse create(@Valid @RequestBody SampleMasterCodeCreateRequest request) {
        return sampleMasterCodeService.create(request);
    }

    @GetMapping
    public List<SampleMasterCodeResponse> findActiveByGroup(@RequestParam String codeGroup) {
        return sampleMasterCodeService.findActiveByGroup(codeGroup);
    }
}
