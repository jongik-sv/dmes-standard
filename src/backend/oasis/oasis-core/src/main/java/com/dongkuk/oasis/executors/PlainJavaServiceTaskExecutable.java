package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.context.ObjectSustainLevel;
import com.dongkuk.oasis.context.SingleObjectRegisterInfo;
import com.dongkuk.oasis.context.SingleObjectSearchCondition;
import com.dongkuk.oasis.exceptions.MethodNotFoundException;
import com.dongkuk.oasis.exceptions.PropertyException;
import com.dongkuk.oasis.exceptions.TaskExecutionException;
import com.dongkuk.oasis.execution.Executable;
import com.dongkuk.oasis.execution.ExecutionResult;
import com.dongkuk.oasis.execution.UnmodifiableExecutionResult;
import com.dongkuk.oasis.expression.inputs.ExpressionParser;
import com.dongkuk.oasis.expression.property.PropertyParser;
import com.dongkuk.oasis.model.Element;
import com.dongkuk.oasis.model.InputOutputContainer;
import com.dongkuk.oasis.model.Property;
import com.dongkuk.oasis.model.activity.JavaServiceTask;
import com.dongkuk.oasis.methodinvoker.ObjectFactory;
import com.dongkuk.oasis.methodinvoker.StrictMethodInvoker;
import com.dongkuk.oasis.methodinvoker.TypeDescribableObject;
import com.dongkuk.oasis.methodinvoker.exceptions.MethodInvokeException;
import com.dongkuk.oasis.methodinvoker.exceptions.MethodResolutionException;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.util.*;

import static com.dongkuk.oasis.model.PropertyNames.*;

/**
 * @author Jeongjin Kim
 * @since 2021-06-25
 */
final class PlainJavaServiceTaskExecutable implements Executable {
    private static final Logger log = LoggerFactory.getLogger(PlainJavaServiceTaskExecutable.class);
    private final JavaServiceTask plainJavaServiceTask;
    private final StrictMethodInvoker methodInvoker = new StrictMethodInvoker();
    private final List<String> acceptablePropertyNames =
            Arrays.asList(INPUT_KEY, METHOD, OUTPUT_KEY, CREATE_NEW_INSTANCE,
                    INPUT_KEY_ONLY, OBJECT, TASK_DTO, OPTIONAL);
    private final Class<?> aClass;
    private final String className;

    private final List<ExpressionParser<TypedObject, TypedObject>> parsers =
            Arrays.asList(
                    new TypeExpressionParserForTest(),
                    new TypeExpressionParser(methodInvoker.objectFactory()),
                    new StringTypeExpressionParser(),
                    new StringExpressionParser());
    private String methodName;

    /**
     * @param aClass               class
     * @param plainJavaServiceTask plainJavaServiceTaskExecutor
     * @param methodName           methodName
     */
    public PlainJavaServiceTaskExecutable(Class<?> aClass,
                                          JavaServiceTask plainJavaServiceTask,
                                          String methodName) {
        this.aClass = aClass;
        this.plainJavaServiceTask = plainJavaServiceTask;
        this.methodName = methodName;
        this.className = aClass.getName();
    }

    /**
     * @param aClass               class
     * @param plainJavaServiceTask plainJavaServiceTaskExecutor
     * @param methodName           methodName
     * @param className            className
     */
    public PlainJavaServiceTaskExecutable(Class<?> aClass,
                                          JavaServiceTask plainJavaServiceTask,
                                          String methodName,
                                          String className) {
        this.aClass = aClass;
        this.plainJavaServiceTask = plainJavaServiceTask;
        this.methodName = methodName;
        this.className = className;
    }

    @Override
    public ExecutionResult execute(ExecutableContext executableContext) {
        Property propertyProperty = plainJavaServiceTask.getProperty(INPUT_KEY);
        Property methodNameProperty = plainJavaServiceTask.getProperty(METHOD);
        Property inputOnlyProperty = plainJavaServiceTask.getProperty(INPUT_KEY_ONLY);
        Property createNewInstanceProperty = plainJavaServiceTask.getProperty(CREATE_NEW_INSTANCE);
        Property objectProperty = plainJavaServiceTask.getProperty(OBJECT);
        Property optionalProperty = plainJavaServiceTask.getProperty(OPTIONAL);

        boolean shouldCreateNewInstance = false;
        boolean isTaskObject = false;
        boolean shouldFindObjectFromContextByClassName = false;
        Set<String> optionalKeys;
        if (objectProperty != null)
            isTaskObject = Boolean.parseBoolean(objectProperty.getValue());

        if (createNewInstanceProperty != null)
            shouldCreateNewInstance = Boolean.parseBoolean(createNewInstanceProperty.getValue());

        if (optionalProperty != null) {
            String[] split = optionalProperty.getValue().split(",");
            optionalKeys = new HashSet<>(split.length);
            Arrays.stream(split).map(String::trim).forEach(optionalKeys::add);
        } else {
            optionalKeys = new HashSet<>(0);
        }

        if (this.methodName == null) {
            if (methodNameProperty == null)
                throw new PropertyException(String.format("Task [%s]([%s]) does not have the [%s] property."
                        , plainJavaServiceTask.getId(), plainJavaServiceTask.getName(), METHOD));
            else this.methodName = methodNameProperty.getValue();
        }

        Map<String, TypedObject> convertInputs
                = convert(executableContext, plainJavaServiceTask.inputs().exportInOrder());

        List<Class<?>> serviceDtoClasses = getDtoClasses(plainJavaServiceTask);
        Map<String, TypedObject> dtos = new HashMap<>();
        if (serviceDtoClasses != null) {
            DtoGeneratorFromServiceContextAndProcessAndInputsContext dtoGenerator =
                    new DtoGeneratorFromServiceContextAndProcessAndInputsContext();
            for (Class<?> serviceDtoClass : serviceDtoClasses) {
                dtos.put(serviceDtoClass.getSimpleName(),
                        new TypedObject(dtoGenerator.generator(executableContext, convertInputs, serviceDtoClass)));
            }
        }
        executableContext = new DtoAddedExecutableContext(executableContext, dtos);

        MethodInvokerContext methodInvokerContext = new MethodInvokerContext(
                executableContext,
                convertInputs,
                propertyProperty == null ? null : PropertyParser.parse(propertyProperty),
                inputOnlyProperty != null && Boolean.parseBoolean(inputOnlyProperty.getValue()),
                Collections.unmodifiableSet(optionalKeys));

        Object object;
        TypedObject typedObject = executableContext.get(this.className);

        if (typedObject == null) {
            if (aClass == null)
                throw new TaskExecutionException(this.className + " is not found");
            log.info("Invoking class : [{}], method : [{}]"
                    , this.className
                    , this.methodName);
            object = executableContext.getObject(new SingleObjectSearchCondition(aClass));
        } else {
            log.info("Invoking object in context: [{}], method : [{}]"
                    , className
                    , this.methodName);
            object = typedObject.getObject();
            shouldFindObjectFromContextByClassName = true;
        }

        if ((!shouldFindObjectFromContextByClassName && shouldCreateNewInstance) || object == null) {
            if (aClass == null)
                throw new TaskExecutionException(this.className + " is not found");
            ObjectFactory objectFactory = methodInvoker.objectFactory();
            object = objectFactory.createObject(aClass, methodInvokerContext);
            executableContext.registerObject(object, new SingleObjectRegisterInfo(aClass, ObjectSustainLevel.PROCESS));
        }

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

        return new UnmodifiableExecutionResult(new TypedObject(result),
                plainJavaServiceTask.outputs().export(),
                isTaskObject);
    }

    private List<Class<?>> getDtoClasses(Element element) {
        Property dto = element.getProperty(PROCESS_DTO);
        if (dto == null)
            return null;

        String[] dtoClassNames = Arrays.stream(dto.getValue().split(","))
                .map(String::trim)
                .toArray(String[]::new);

        List<Class<?>> classes = new ArrayList<>();

        for (String dtoClassName : dtoClassNames) {
            try {
                classes.add(Class.forName(dtoClassName));
            } catch (ClassNotFoundException e) {
                throw new RuntimeException("The DTO class is incorrect.", e);
            }
        }

        return classes;
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
            if (parser.canParse(value, executableContext, inputs)) {
                return parser.parse(value, executableContext, inputs);
            }
        }
        throw new IllegalArgumentException("Input value error...." + value.getObject(String.class));
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
