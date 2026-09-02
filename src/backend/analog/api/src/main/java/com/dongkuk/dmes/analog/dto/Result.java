package com.dongkuk.dmes.analog.dto;

import com.dongkuk.analogexpress.postprocessing.ServiceDefinition;

import java.util.List;

public class Result {
    private final String log;
    private final List<ServiceDefinition> serviceList;

    public Result(String log, List<ServiceDefinition> serviceList) {
        this.log = log;
        this.serviceList = serviceList;
    }

    public String getLog() {
        return log;
    }

    public List<ServiceDefinition> getServiceList() {
        return serviceList;
    }
}
