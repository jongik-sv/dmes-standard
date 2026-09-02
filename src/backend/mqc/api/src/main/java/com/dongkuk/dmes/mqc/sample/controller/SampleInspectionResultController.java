package com.dongkuk.dmes.mqc.sample.controller;

import com.dongkuk.dmes.mqc.sample.dto.SampleInspectionResultCreateRequest;
import com.dongkuk.dmes.mqc.sample.dto.SampleInspectionResultResponse;
import com.dongkuk.dmes.mqc.sample.service.SampleInspectionResultService;
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
@RequestMapping("/api/mqc/sample-inspection-results")
@RequiredArgsConstructor
public class SampleInspectionResultController {

    private final SampleInspectionResultService service;

    @GetMapping
    public List<SampleInspectionResultResponse> findAll() {
        return service.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SampleInspectionResultResponse create(@Valid @RequestBody SampleInspectionResultCreateRequest request) {
        return service.create(request);
    }
}
