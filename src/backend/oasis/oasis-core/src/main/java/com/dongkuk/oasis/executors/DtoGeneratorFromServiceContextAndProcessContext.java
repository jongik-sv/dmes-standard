package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.utils.ObjectUtil;

import java.util.HashMap;
import java.util.Map;
import java.util.stream.Collectors;

class DtoGeneratorFromServiceContextAndProcessContext {
    public <T> T generator(ExecutableContext context, Class<T> tClass) {
        Map<String, Object> processContextData = context.processContext().elementOutputs()
                .entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue().getObject()));

        Map<String, Object> serviceContextData = context.serviceContext().serviceInputs()
                .entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue().getObject()));

        Map<String, Object> collect = new HashMap<>(serviceContextData);
        collect.putAll(processContextData);
        return ObjectUtil.convertMapToObject(collect, tClass);
    }
}
