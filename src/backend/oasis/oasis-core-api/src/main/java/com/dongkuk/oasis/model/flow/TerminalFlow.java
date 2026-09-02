package com.dongkuk.oasis.model.flow;

import com.dongkuk.oasis.model.EndEvent;

/**
 * 마지막 흐름 정의.
 * <p>
 * 주로 {@link EndEvent} 에 달려있는 흐름.
 * <p>
 * 더 이상 진행할 흐름이 존재하지 않음을 의미함.
 *
 * @author Jeongjin Kim
 * @since 2021-02-05
 */
public interface TerminalFlow extends Flow {
}
