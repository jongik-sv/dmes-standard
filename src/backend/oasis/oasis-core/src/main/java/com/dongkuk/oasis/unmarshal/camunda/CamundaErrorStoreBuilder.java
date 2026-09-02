package com.dongkuk.oasis.unmarshal.camunda;

import com.dongkuk.oasis.model.error.DefaultError;
import com.dongkuk.oasis.unmarshal.ErrorStore;
import com.dongkuk.oasis.unmarshal.ErrorStoreBuilder;
import org.jdom2.Element;

/**
 * @author Jeongjin Kim
 * @since 2021-07-21
 */
final class CamundaErrorStoreBuilder implements ErrorStoreBuilder<Element> {
    /**
     * @param serviceElement 요소
     * @return 에러 스토어
     */
    @Override
    public ErrorStore errors(Element serviceElement) {
        if (!serviceElement.getName().equals("definitions"))
            throw new IllegalArgumentException("Not a service level element.");

        CamundaErrorStore errorStore = new CamundaErrorStore();

        for (Element element : serviceElement.getChildren()) {
            if (!element.getName().equals("error"))
                continue;

            String errorId = element.getAttributeValue("id");
            String errorName = element.getAttributeValue("name");
            String errorCode = element.getAttributeValue("errorCode");
            String errorMessage = element.getAttributeValue("errorMessage",
                    element.getNamespace("camunda"));
            errorStore.put(new DefaultError(errorId, errorName, errorCode, errorMessage));
        }
        return errorStore;
    }
}