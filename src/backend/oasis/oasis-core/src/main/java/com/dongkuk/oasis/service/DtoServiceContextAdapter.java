package com.dongkuk.oasis.service;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.utils.StringUtil;

import java.util.*;

import static com.dongkuk.oasis.model.PropertyNames.SERVICE_DTO;

/**
 * {@link ServiceContext}에서 DTO를 추출하여 추가하여 반환한다.
 */
public class DtoServiceContextAdapter implements ServiceContextAdapter {
    @Override
    public ServiceContext adaptServiceInput(ServiceContext serviceContext, Process initialProcess) {
        List<Class<?>> serviceDtoClasses = getServiceDtoClasses(initialProcess);
        Map<String, TypedObject> dtos = new HashMap<>();
        if (serviceDtoClasses != null) {
            DefaultDtoGeneratorFromServiceContext dtoGenerator = new DefaultDtoGeneratorFromServiceContext();
            for (Class<?> serviceDtoClass : serviceDtoClasses) {
                dtos.put(StringUtil.convertToCamelCase(serviceDtoClass.getSimpleName()),
                        new TypedObject(dtoGenerator.generator(serviceContext, serviceDtoClass)));
            }
        }
        dtos.putAll(serviceContext.serviceInputs());
        return serviceContext.createSubServiceContext(dtos);
    }

    private List<Class<?>> getServiceDtoClasses(Process initialProcess) {
        Property dto = initialProcess.getProperty(SERVICE_DTO);
        if (dto == null)
            return null;

        String[] dtoClassNames = Arrays.stream(dto.getValue().split(","))
                .map(String::trim)
                .toArray(String[]::new);

        List<Class<?>> classes = new ArrayList<>();

        for (String dtoClassName : dtoClassNames) {
            try {
                classes.add(Class.forName(dtoClassName));
            } catch (ClassNotFoundException e) {
                throw new RuntimeException("Service DTO class is incorrect.", e);
            }
        }

        return classes;
    }
}
