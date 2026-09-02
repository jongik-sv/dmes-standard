package com.dongkuk.oasis.model.activity;

import com.dongkuk.oasis.model.InputOutputContainer;
import com.dongkuk.oasis.model.MultiInstance;
import com.dongkuk.oasis.model.PropertyContainer;
import com.dongkuk.oasis.model.flow.ConditionalFlow;
import com.dongkuk.oasis.model.flow.DefaultFlow;
import com.dongkuk.oasis.model.flow.SequentialFlow;
import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;

import java.util.Collection;

/**
 * @author Jeongjin Kim
 * @since 2021-06-21
 */
@SuppressFBWarnings("EI_EXPOSE_REP2")
public final class TransactionScriptTask extends AbstractTask {
    private final String transactionScript;

    /**
     * Transaction Script 를 생성한다.
     *
     * @param taskId            태스트 식별자
     * @param taskName          태스크 이름
     * @param conditionalFlows  조건 Flow
     * @param defaultFlow       기본 Flow
     * @param sequentialFlow    순서 Flow
     * @param transactionScript Transaction Script
     * @param properties        태스크 속성
     * @param inputs            입력값
     * @param outputs           출력값
     * @param multiInstance     반복특성
     */
    public TransactionScriptTask(String taskId,
                                 String taskName,
                                 Collection<ConditionalFlow> conditionalFlows,
                                 DefaultFlow defaultFlow,
                                 SequentialFlow sequentialFlow,
                                 String transactionScript,
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

        this.transactionScript = transactionScript;
    }

    /**
     * @return transactionScript
     */
    public String getTransactionScript() {
        return transactionScript;
    }
}
