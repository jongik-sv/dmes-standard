package com.dongkuk.oasis.process;

import com.dongkuk.oasis.context.ProcessContext;
import com.dongkuk.oasis.model.Process;
import com.dongkuk.oasis.model.flow.nodes.FlowPicker;

/**
 * 프로세스 내에 있는 테스크를 순차적으로 실행하는 역할을 한다.
 * 실행한 결과를 기반으로 {@link FlowPicker}를 사용하여 다음 실행할 태스크를 선택한다.
 * <p>
 * 요소 프로퍼티에 {@code output} 이 지정되어 있으면 {@link ProcessContext}에 데이터를 저장한다.
 *
 * @author Jeongjin Kim
 * @since 2021-02-10
 */
public interface ProcessStarter {
    /**
     * @param initialProcess 초기 프로세스
     * @param processContext 프로세스 컨택스트
     */
    void start(Process initialProcess, ProcessContext processContext);
}
