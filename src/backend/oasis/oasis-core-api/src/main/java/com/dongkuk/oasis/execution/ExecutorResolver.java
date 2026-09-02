package com.dongkuk.oasis.execution;

import com.dongkuk.oasis.model.Element;

/**
 * 요소의 실행기를 선택하여 반환함.
 *
 * @author Jeongjin Kim
 * @since 2021-06-25
 */
public interface ExecutorResolver {
    /**
     * @param element executable
     * @return executor
     */
    Executable find(Element element);
}
