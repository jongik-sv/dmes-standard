package com.dongkuk.oasis.service;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ProcessContext;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.utils.ObjectUtil;

import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Collectors;

/**
 * {@code Context}에서 DTO를 추출하여 반환한다.
 */
public class DtoGeneratorWithContext {
    /**
     * 지정한 클래스를 {@link ServiceContext}와 {@link ProcessContext}를 이용하여 생성한다.
     * <p>
     * 필요한 DTO를 생성하지 못 했을 경우는 빈 {@link Map}을 반환한다.
     *
     * @param classes        DTO 클래스
     * @param serviceContext 서비스 컨텍스트
     * @param processContext 프로세스 컨텍스트
     * @return DTO 목록
     */
    public Map<String, TypedObject> generateDto(List<Class<?>> classes,
                                                ServiceContext serviceContext,
                                                ProcessContext processContext) {
        Map<String, TypedObject> dtos = new HashMap<>();

        for (Class<?> serviceDtoClass : classes) {
            dtos.put(serviceDtoClass.getSimpleName(),
                    new TypedObject(make(serviceDtoClass, serviceContext, processContext), serviceDtoClass));
        }

        return dtos;
    }

    private Object make(Class<?> clazz, ServiceContext serviceContext, ProcessContext processContext) {
        Map<String, Object> serviceInputs = serviceContext.serviceInputs()
                .entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue().getObject()));
        Map<String, Object> processOutputs = processContext.elementOutputs()
                .entrySet().stream()
                .collect(Collectors.toMap(Map.Entry::getKey, e -> e.getValue().getObject()));
        serviceInputs.putAll(processOutputs);

        return ObjectUtil.convertMapToObject(serviceInputs, clazz);
    }
}
