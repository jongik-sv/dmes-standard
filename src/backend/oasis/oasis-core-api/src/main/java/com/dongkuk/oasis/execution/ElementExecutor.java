package com.dongkuk.oasis.execution;

import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.model.Element;

/**
 * {@link Executable}를 실행시켜주는 요소 실행기이다.
 *
 * @author Jeongjin Kim
 * @since 2021-06-01
 */
public interface ElementExecutor {
    /**
     * 실행 가능한 요소를 실행한다.
     *
     * @param element           요소
     * @param executableContext 실행 가능 요소 컨텍스트
     * @return 실행결과, 실행 결과가 없으면 {@code null}을 반환한다.
     */
    ExecutionResult execute(Element element, ExecutableContext executableContext);

}
