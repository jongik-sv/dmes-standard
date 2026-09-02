package com.dongkuk.dmes.mpn.sample.controller;

import com.dongkuk.dmes.mpn.sample.dto.SampleWorkOrderCreateRequest;
import com.dongkuk.dmes.mpn.sample.dto.SampleWorkOrderResponse;
import com.dongkuk.dmes.mpn.sample.service.SampleWorkOrderService;
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
@RequestMapping("/api/mpn/sample-work-orders")
@RequiredArgsConstructor
public class SampleWorkOrderController {

    private final SampleWorkOrderService service;

    @GetMapping
    public List<SampleWorkOrderResponse> findAll() {
        return service.findAll();
    }

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public SampleWorkOrderResponse create(@Valid @RequestBody SampleWorkOrderCreateRequest request) {
        return service.create(request);
    }
}
