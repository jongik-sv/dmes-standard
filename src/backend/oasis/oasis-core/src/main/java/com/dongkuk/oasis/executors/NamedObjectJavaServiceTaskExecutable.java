package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.exceptions.MethodNotFoundException;
import com.dongkuk.oasis.exceptions.PropertyException;
import com.dongkuk.oasis.exceptions.TaskExecutionException;
import com.dongkuk.oasis.execution.Executable;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.execution.UnmodifiableExecutionResult;
import com.dongkuk.oasis.expression.inputs.ExpressionParser;
import com.dongkuk.oasis.expression.property.PropertyParser;
import com.dongkuk.oasis.model.InputOutputContainer;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.activity.JavaServiceTask;
import com.dongkuk.oasis.methodinvoker.StrictMethodInvoker;
import com.dongkuk.oasis.methodinvoker.TypeDescribableObject;
import com.dongkuk.oasis.methodinvoker.exceptions.MethodInvokeException;
import com.dongkuk.oasis.methodinvoker.exceptions.MethodResolutionException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import static com.dongkuk.oasis.model.PropertyNames.*;

/**
 * 지정한 클래스 대신 컨텍스트에서 이름을 찾아 그 오브젝트를 실행 대상으로 하는 {@link Executable}이다.
 *
 * @author Jeongjin Kim
 * @since 2022-05-27
 */
final class NamedObjectJavaServiceTaskExecutable implements Executable {
    private static final Logger log = LoggerFactory.getLogger(NamedObjectJavaServiceTaskExecutable.class);
    private final JavaServiceTask plainJavaServiceTask;
    private final StrictMethodInvoker methodInvoker = new StrictMethodInvoker();
    private final List<String> acceptablePropertyNames =
            Arrays.asList(INPUT_KEY, METHOD, OUTPUT_KEY, CREATE_NEW_INSTANCE, INPUT_KEY_ONLY);
    private final String objectName;
    private final List<ExpressionParser<TypedObject, TypedObject>> parsers =
            Arrays.asList(new TypeExpressionParser(methodInvoker.objectFactory()), new StringTypeExpressionParser());
    private String methodName;

    /**
     * @param objectName           objectName
     * @param plainJavaServiceTask plainJavaServiceTaskExecutor
     * @param methodName           methodName
     */
    public NamedObjectJavaServiceTaskExecutable(String objectName,
                                                JavaServiceTask plainJavaServiceTask,
                                                String methodName) {
        this.objectName = objectName;
        this.plainJavaServiceTask = plainJavaServiceTask;
        this.methodName = methodName;
    }

    @Override
    public ExecutionResult execute(ExecutableContext executableContext) {
        Property propertyProperty = plainJavaServiceTask.getProperty(INPUT_KEY);
        Property methodNameProperty = plainJavaServiceTask.getProperty(METHOD);
        Property inputOnlyProperty = plainJavaServiceTask.getProperty(INPUT_KEY_ONLY);

        if (this.methodName == null) {
            if (methodNameProperty == null)
                throw new PropertyException(String.format("Task [%s]([%s]) does not have the [%s] property."
                        , plainJavaServiceTask.getId(), plainJavaServiceTask.getName(), METHOD));
            else this.methodName = methodNameProperty.getValue();
        }

        Object object;
        TypedObject typedObject = executableContext.get(this.objectName);
        if (typedObject == null) {
            throw new ObjectNotFoundException();
        } else {
            object = typedObject.getObject();
        }

        log.info("Invoking class : [{}], method : [{}], objectName : [{}]"
                , object.getClass().getName()
                , this.methodName
                , this.objectName);

        Map<String, TypedObject> convertInputs
                = convert(executableContext, plainJavaServiceTask.inputs().exportInOrder());

        MethodInvokerContext methodInvokerContext = new MethodInvokerContext(
                executableContext,
                convertInputs,
                propertyProperty == null ? null : PropertyParser.parse(propertyProperty),
                inputOnlyProperty != null && Boolean.parseBoolean(inputOnlyProperty.getValue()));

        TypeDescribableObject result;
        try {
            result = methodInvoker.invoke(
                    object,
                    this.methodName,
                    methodInvokerContext);
        } catch (MethodResolutionException e) {
            throw new MethodNotFoundException(resolveMethodMessage(e), e);
        } catch (MethodInvokeException e) {
            throw new TaskExecutionException(e);
        }

        return new UnmodifiableExecutionResult(new TypedObject(result), plainJavaServiceTask.outputs().export());
    }

    private Map<String, TypedObject> convert(ExecutableContext executableContext
            , List<InputOutputContainer.InputOutputEntry> inputs) {
        if (inputs == null)
            throw new IllegalArgumentException("The input is null.");

        Map<String, TypedObject> result = new HashMap<>();

        for (InputOutputContainer.InputOutputEntry entry : inputs) {
            result.put(entry.getKey(), convertValue(entry.getValue(), executableContext, result));
        }
        return result;
    }

    private TypedObject convertValue(TypedObject value, ExecutableContext executableContext
            , Map<String, TypedObject> inputs) {
        for (ExpressionParser<TypedObject, TypedObject> parser : parsers) {
            if (parser.canParse(value)) {
                return parser.parse(value, getMethodInvokerContext(executableContext, inputs));
            }
        }
        throw new IllegalArgumentException("Input value error..." + value.getObject(String.class));
    }

    private MethodInvokerContext getMethodInvokerContext(ExecutableContext executableContext
            , Map<String, TypedObject> inputs) {
        return new MethodInvokerContext(executableContext
                , inputs
                , PropertyParser.parse(new Property("new", "true"))
                , false);
    }

    @Override
    public boolean canAcceptProperty(String propertyName) {
        return acceptablePropertyNames.contains(propertyName);
    }

    private String resolveMethodMessage(MethodResolutionException e) {
        if (e.getCause() != null && e.getCause().getMessage() != null) {
            return e.getCause().getMessage();
        }
        return e.getMessage();
    }
}
