package com.dongkuk.oasis.process;

import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.model.Element;

/**
 * @author Jeongjin Kim
 * @since 2021-06-24
 */
public interface ElementFindableContext extends ExecutableContext {
    /**
     * @param elementId 요소 식별자
     * @return element
     */
    Element element(String elementId);
}
