package com.dongkuk.oasis.model.activity;

import com.dongkuk.oasis.model.InputOutputContainer;
import com.dongkuk.oasis.model.MultiInstance;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.ServiceTask;
import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.SequentialFlow;

import java.util.Collection;

/**
 * 일반 자바 클래스를 실행할 수 있는 태스크.
 * <p>
 * 실행할 클래스명과 메소드명을 입력받아 해당 클래스 개체를 만들고 메소드를 실행한다.
 *
 * @author Jeongjin Kim
 * @since 2021-03-31
 */
public final class JavaServiceTask extends AbstractTask implements ServiceTask {
    private final String className;

    /**
     * {@link ConditionalFlow}와 {@link DefaultFlow} 를 가진 태스크를 생성한다.
     *
     * @param taskId           태스트 식별자
     * @param taskName         태스크 이름
     * @param conditionalFlows 조건 Flow
     * @param defaultFlow      기본 Flow
     * @param sequentialFlow   순서 Flow
     * @param className        실행할 클래스
     * @param properties       태스크 속성
     * @param inputs           입력값
     * @param outputs          출력값
     * @param multiInstance    반복특성
     */
    public JavaServiceTask(String taskId,
                           String taskName,
                           Collection<ConditionalFlow> conditionalFlows,
                           DefaultFlow defaultFlow,
                           SequentialFlow sequentialFlow,
                           String className,
                           PropertyContainer properties,
                           InputOutputContainer inputs,
                           InputOutputContainer outputs,
                           MultiInstance multiInstance) {
        super(taskId,
                taskName,
                properties,
                conditionalFlows,
                defaultFlow,
                sequentialFlow,
                inputs,
                outputs,
                multiInstance);
        if (className == null)
            throw new IllegalArgumentException("Required value is null, className");
        this.className = className;
    }

    /**
     * @return 태스크에 지정한 클래스 이름
     */
    public String getClassName() {
        return className;
    }
}
