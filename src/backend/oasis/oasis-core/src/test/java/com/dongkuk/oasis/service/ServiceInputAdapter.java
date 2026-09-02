package com.dongkuk.oasis.service;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.utils.MapBuilder;

/**
 * @author Jeongjin Kim
 * @since 2021-06-04
 */
public class ServiceInputAdapter implements ServiceAdapter {
    @Override
    public ServiceContext adapt(ServiceContext serviceContext) {
        DomainClassInputClass domainClassInputClass =
                new DomainClassInputClass(serviceContext.serviceInput("id").getObject(String.class));
        return serviceContext.createSubServiceContext(new MapBuilder<String, TypedObject>()
                .addEntity("inputClass", new TypedObject(domainClassInputClass))
                .build());
    }
}
