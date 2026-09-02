package com.dongkuk.oasis.execution;

import com.dongkuk.oasis.TypedObject;

import java.util.Map;

/**
 * 단위 요소 실행결과를 저장한다. 실행 결과는 다음 흐름을 선택하기 위한 자료로 사용하거나 프로세스 출력에 사용한다.
 *
 * @author Jeongjin Kim
 * @since 2021-05-13
 */
public interface ExecutionResult {
    /**
     * @return 결과 객체
     */
    TypedObject result();

    /**
     * Input/Output 탭에서 Output parameter 에 입력한 자료를 반환한다.
     *
     * @return 출력값
     */
    Map<String, TypedObject> outputs();

    /**
     * 요소의 결과를 프로세스의 결과로 넘기지 않고 다른 프로세스의 입력값 또는 실행 객체로 사용할 경우 {@code true}
     * 를 반환한다.
     *
     * @return object 여부
     */
    boolean useObject();
}
