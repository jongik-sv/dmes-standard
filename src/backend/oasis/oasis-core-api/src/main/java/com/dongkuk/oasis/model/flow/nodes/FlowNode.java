package com.dongkuk.oasis.model.flow.nodes;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.model.flow.Flow;

/**
 * 요소가 가질 수 있는 흐름 종류를 정의하는 인터페이스.
 *
 * @author Jeongjin Kim
 * @since 2021-01-30
 */
public interface FlowNode {
    /**
     * {@link Flow} 중 조건에 맞는 것을 선택한다.
     *
     * @param picker 선택기
     * @param object Context
     * @return 선택된 흐름
     */
    Flow pick(FlowPicker picker, TypedObject object);
}
