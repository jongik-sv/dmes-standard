package com.dongkuk.oasis.execution;

import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.model.Task;

/**
 * {@link Task} 정보를 기반으로 실행한다.
 * 요소가 해야하는 일의 로직이다.
 * <p>
 * Task 인스턴스 당 실행기 인스턴스가 하나씩 생성되어야 한다.
 *
 * @author Jeongjin Kim
 * @since 2021-06-25
 */
public interface Executable {
    /**
     * @param executableContext executableNodeContext
     * @return ExecutionResult
     */
    ExecutionResult execute(ExecutableContext executableContext);

    /**
     * @param propertyName 프로퍼티 이름
     * @return 사용 가능 여부
     */
    boolean canAcceptProperty(String propertyName);
}
