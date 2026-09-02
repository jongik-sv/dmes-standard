package com.dongkuk.dmes.mpp.sample.controller;

import com.dongkuk.dmes.mpp.sample.dto.SampleProductionRecordCreateRequest;
import com.dongkuk.dmes.mpp.sample.dto.SampleProductionRecordResponse;
import com.dongkuk.dmes.mpp.sample.service.SampleProductionRecordService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/mpp/sample-production-records")
@RequiredArgsConstructor
public class SampleProductionRecordController {

    private final SampleProductionRecordService service;

    @GetMapping
    public List<SampleProductionRecordResponse> findAll() {
        return service.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SampleProductionRecordResponse create(@Valid @RequestBody SampleProductionRecordCreateRequest request) {
        return service.create(request);
    }
}
