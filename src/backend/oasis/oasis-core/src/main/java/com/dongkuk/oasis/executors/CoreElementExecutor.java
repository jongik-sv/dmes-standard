package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.exceptions.PropertyException;
import com.dongkuk.oasis.execution.ElementExecutor;
import com.dongkuk.oasis.execution.Executable;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.execution.ExecutorResolver;
import com.dongkuk.oasis.model.*;
import com.dongkuk.oasis.utils.StringUtil;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.expression.spel.standard.SpelExpressionParser;
import org.springframework.util.StringUtils;

import java.util.Set;

import static com.dongkuk.oasis.model.PropertyNames.*;

/**
 * @author Jeongjin Kim
 * @since 2021-06-01
 */
public final class CoreElementExecutor implements ElementExecutor {
    private static final org.slf4j.Logger log = org.slf4j.LoggerFactory.getLogger(CoreElementExecutor.class);
    private final ExecutorResolver executorResolver;

    /**
     * @param executorResolver executorResolver
     */
    public CoreElementExecutor(ExecutorResolver executorResolver) {
        this.executorResolver = executorResolver;
    }

    /**
     * 실행 가능한 요소를 실행한다.
     * <p>
     * 요소를 실행하고 요소 프로퍼티에 {@code log} 속성이 있으면 속성값을 {@code SpEL}로 해석하여 로그를 남긴다.
     *
     * @param element           요소
     * @param executableContext 실행 가능 요소 컨텍스트
     * @return 태스크 실행 결과, 실행 결과가 없으면 {@code null}을 반환한다.
     */
    @Override
    public ExecutionResult execute(Element element, ExecutableContext executableContext) {
        Executable executable = executorResolver.find(element);
        validateProperties(element, executable);
        ExecutionResult execute;
        executableContext.raiseEvent(new ElementExecutedEvent(element));

        if (element instanceof MultiInstance) {
            MultiInstance multiInstanceElement = (MultiInstance) element;

            MultiInstanceType multiInstanceType = multiInstanceElement.multiInstanceType();

            if (multiInstanceType == MultiInstanceType.PARALLEL_MULTI_INSTANCE) {
                log.info("Parallel Multi Instance task start");
                execute = new ParallelMultiInstanceInternalElementExecutor()
                        .execute(executable, element, executableContext);
            } else if (multiInstanceType == MultiInstanceType.SEQUENTIAL_MULTI_INSTANCE) {
                log.info("Sequential Multi Instance task start");
                execute =  new SequentialMultiInstanceInternalElementExecutor()
                        .execute(executable, element, executableContext);
            } else if (multiInstanceType == MultiInstanceType.LOOP) {
                log.info("Loop task start");
                execute = new LoopMultiInstanceInternalElementExecutor()
                        .execute(executable, element, executableContext);
            } else {
                Property property = element.getProperty(ITERATOR);
                if (property != null)
                    throw new PropertyException(
                            String.format("It's not a repeating element, but it has the [%s] attribute.", ITERATOR));
                execute = executable.execute(executableContext);
            }
        } else {
            execute = executable.execute(executableContext);
        }

        Property log = element.getProperty(LOG_DEBUG);
        if (log != null && StringUtil.hasText(log.getValue())) {
            log(execute == null ? null : execute.result(), element.getProperty(LOG_DEBUG)
            ,element.getClass());
        }
        return execute;
    }

    private void validateProperties(Element element, Executable executable) {
        Set<String> values = element.properties().exportProperties().keySet();
        for (String value : values) {
            if (value.equals(LOG_DEBUG))
                continue;
            else if (element instanceof MultiInstance && value.equals(ITERATOR))
                continue;

            if (!executable.canAcceptProperty(value))
                throw new PropertyException(
                        String.format("[%s] is an unavailable attribute. Element [%s](%s). Executor [%s]",
                                value, element.getId(), element.getName(), executable.getClass().getName()));
        }
    }

    private void log(TypedObject result, Property log, Class<? extends Element> aClass) {
        if (StringUtils.hasText(log.getValue())) {
            Logger logger = LoggerFactory.getLogger(aClass);
            logger.debug(new SpelExpressionParser().
                    parseExpression(log.getValue()).
                    getValue((result == null || result.getObject() == null) ? "" : result.getObject(), String.class)
            );
        }
    }

    interface InnerElementExecutor {
        ExecutionResult execute(Executable executable, Element element, ExecutableContext executableContext);
    }
}
