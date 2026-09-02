package com.dongkuk.oasis.service;

import com.dongkuk.oasis.context.ServiceContext;
import com.dongkuk.oasis.exceptions.PropertyException;
import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.utils.StringUtil;
import com.dongkuk.oasis.methodinvoker.MethodInvoker;
import com.dongkuk.oasis.methodinvoker.SingleLevelContext;
import com.dongkuk.oasis.methodinvoker.StrictMethodInvoker;
import com.dongkuk.oasis.methodinvoker.TypeDescribableObject;

import static com.dongkuk.oasis.model.PropertyNames.SERVICE_ADAPTER;

/**
 * @author Jeongjin Kim
 * @since 2021-07-08
 */
public final class DefaultServiceContextAdapter implements ServiceContextAdapter {
    /**
     * @param serviceContext 변환 전 서비스 컨텍스트
     * @param initialProcess 초기 프로세스
     * @return 변환된 서비스 컨테긋트
     */
    public ServiceContext adaptServiceInput(ServiceContext serviceContext, Process initialProcess) {
        Property adapter = initialProcess.getProperty(SERVICE_ADAPTER);
        if (adapter != null) {
            String adapterClassName = adapter.getValue();
            if (!StringUtil.hasText(adapterClassName))
                throw new PropertyException("Conversion class is not specified.");

            MethodInvoker methodInvoker = new StrictMethodInvoker();
            SingleLevelContext singleLevelContext = new SingleLevelContext();
            singleLevelContext.add("serviceContext",
                    new TypeDescribableObject(serviceContext));
            TypeDescribableObject adapt = methodInvoker.invoke(adapterClassName.trim(), "adapt", singleLevelContext);
            return adapt.getObject(ServiceContext.class);
        } else
            return serviceContext;
    }
}
