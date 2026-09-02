package com.dongkuk.dmes.mls.sample.controller;

import com.dongkuk.dmes.mls.sample.dto.SampleInventoryItemCreateRequest;
import com.dongkuk.dmes.mls.sample.dto.SampleInventoryItemResponse;
import com.dongkuk.dmes.mls.sample.service.SampleInventoryItemService;
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
@RequestMapping("/api/mls/sample-inventory-items")
@RequiredArgsConstructor
public class SampleInventoryItemController {

    private final SampleInventoryItemService service;

    @GetMapping
    public List<SampleInventoryItemResponse> findAll() {
        return service.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SampleInventoryItemResponse create(@Valid @RequestBody SampleInventoryItemCreateRequest request) {
        return service.create(request);
    }
}
