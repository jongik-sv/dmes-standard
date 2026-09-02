package com.dongkuk.dmes.aps.sample.controller;

import com.dongkuk.dmes.aps.sample.dto.SampleItemCreateRequest;
import com.dongkuk.dmes.aps.sample.dto.SampleItemResponse;
import com.dongkuk.dmes.aps.sample.service.SampleItemService;
import jakarta.validation.Valid;
import java.util.List;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

@RestController
@RequestMapping("/api/aps/sample-items")
@RequiredArgsConstructor
public class SampleItemController {

    private final SampleItemService sampleItemService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SampleItemResponse create(@Valid @RequestBody SampleItemCreateRequest request) {
        return sampleItemService.create(request);
    }

    @GetMapping
    public List<SampleItemResponse> findAll() {
        return sampleItemService.findAll();
    }

    @GetMapping("/{code}")
    public SampleItemResponse findByCode(@PathVariable String code) {
        return sampleItemService.findByCode(code);
    }
}
