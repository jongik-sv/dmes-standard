package com.dongkuk.oasis.service;

import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.utils.ObjectUtil;

import java.util.Map;
import java.util.stream.Collectors;

public class DefaultDtoGeneratorFromServiceContext implements DtoGeneratorFromServiceContext {
    @Override
    public <T> T generator(ServiceContext serviceContext, Class<T> tClass) {
        Map<String, Object> collect = serviceContext.serviceInputs()
                .entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue().getObject()));

        return ObjectUtil.convertMapToObject(collect, tClass);
    }
}
