package com.dongkuk.oasis.wow;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.WowContext;

/**
 * JavaServiceTask 에서 호출 할 수 있는 인터페이스.
 *
 * @author Jeongjin Kim
 * @since 2021-01-30
 */
public interface Wow {
    /**
     * @param wowContext 컨텍스트
     * @return 실행결과
     */
    TypedObject run(WowContext wowContext);
}
