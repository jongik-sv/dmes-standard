package com.dongkuk.oasis.service;

import com.dongkuk.oasis.context.ProcessContext;
import com.dongkuk.oasis.model.Service;

/**
 * @author Jeongjin Kim
 * @since 2021-07-19
 */
public interface ServiceFindableContext extends ProcessContext {

    /**
     * @param serviceId 서비스 식별자
     * @return element
     */
    Service service(String serviceId);
}
