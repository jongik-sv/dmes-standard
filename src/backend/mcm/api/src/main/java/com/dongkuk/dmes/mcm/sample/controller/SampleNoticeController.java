package com.dongkuk.dmes.mcm.sample.controller;

import com.dongkuk.dmes.mcm.sample.dto.SampleNoticeCreateRequest;
import com.dongkuk.dmes.mcm.sample.dto.SampleNoticeResponse;
import com.dongkuk.dmes.mcm.sample.service.SampleNoticeService;
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
@RequestMapping("/api/mcm/sample-notices")
@RequiredArgsConstructor
public class SampleNoticeController {

    private final SampleNoticeService service;

    @GetMapping
    public List<SampleNoticeResponse> findAll() {
        return service.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SampleNoticeResponse create(@Valid @RequestBody SampleNoticeCreateRequest request) {
        return service.create(request);
    }
}
