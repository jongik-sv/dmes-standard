package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.ContextAccessor;
import com.dongkuk.oasis.context.ExecutableContext;
import com.dongkuk.oasis.expression.property.PropertyExpression;
import com.dongkuk.oasis.expression.property.PropertyUtil;
import com.dongkuk.oasis.utils.ObjectUtil;
import com.dongkuk.oasis.methodinvoker.*;
import com.dongkuk.oasis.methodinvoker.exceptions.NoUniqueElementException;

import java.lang.reflect.Method;
import java.lang.reflect.Type;
import java.util.*;

import static com.dongkuk.oasis.model.PropertyNames.INPUT_KEY;

/**
 * {@link com.dongkuk.oasis.methodinvoker.MethodInvoker} 를 사용하기 위한 컨텍스트.
 *
 * @author Jeongjin Kim
 * @since 2021-03-31
 */
final class MethodInvokerContext implements Context, ContextDiagnosticsProvider {
    private final ExecutableContext context;
    private final Map<String, TypedObject> inputs;
    private final List<PropertyExpression> inputProperty;
    private final Boolean inputOnly;

    private final Set<String> optionalParameters;

    public MethodInvokerContext(ExecutableContext context,
                                Map<String, TypedObject> inputs,
                                List<PropertyExpression> inputProperty,
                                Boolean inputOnly,
                                Set<String> optionalParameters) {
        if (context == null)
            throw new IllegalArgumentException("ExecutableNodeContext is null");
        if (inputs == null)
            throw new IllegalArgumentException("inputs is null");

        this.context = context;
        this.inputs = inputs;
        this.inputProperty = inputProperty == null ? new ArrayList<>(0) : inputProperty;
        this.inputOnly = inputOnly != null && inputOnly;
        this.optionalParameters = optionalParameters == null ? new HashSet<>(0) : optionalParameters;
    }

    public MethodInvokerContext(ExecutableContext context,
                                Map<String, TypedObject> inputs,
                                List<PropertyExpression> inputProperty,
                                Boolean inputOnly) {
        this(context, inputs, inputProperty, inputOnly, null);
    }

    @Override
    public TypeDescribableObject getValueByKey(String key) {
        if (inputs.containsKey(key)) {
            return new TypeDescribableObject(inputs.get(key).getObject(), inputs.get(key).getType());
        }
        // inputProperty 에 정의된 것만 찾아서 반환
        if (inputOnly && inputProperty.size() > 0) {
            PropertyExpression propertyExpression = PropertyUtil.findOneByAlias(inputProperty, key);

            if (propertyExpression == null) {
                TypeDescribableObject object = getObjectByUnpackedAlias(key);
                if (object != null) return object;
                throw new NoSuchElementException(String.format(
                        "The key [%s] does not exist in the property [%s]. ", key, INPUT_KEY));
            }

            TypedObject o = getFromContextWithExpression(key, propertyExpression);

            return o.toTypeDescribableObject();
        } else if (!inputOnly && inputProperty.size() > 0) {
            PropertyExpression propertyExpression = PropertyUtil.findOneByAlias(inputProperty, key);

            if (propertyExpression == null) {
                TypeDescribableObject object = getObjectByUnpackedAlias(key);
                if (object != null) return object;
                return getFromContext(key);
            } else {
                TypedObject o = getFromContextWithExpression(key, propertyExpression);

                return o.toTypeDescribableObject();
            }
        } else {
            return getFromContext(key);
        }
    }

    private TypeDescribableObject getObjectByUnpackedAlias(String key) {
        for (PropertyExpression alias : PropertyUtil.findUnpackedAlias(inputProperty)) {
            String s = PropertyUtil.removeUnpackKeyword(alias.getAlias(String.class));
            TypedObject o = getFromContextWithExpression(s, alias);
            if (o.getObject() instanceof Map) {
                try {
                    Map<?, ?> object = (Map<?, ?>) o.getObject();
                    if (object.containsKey(key))
                        return new TypeDescribableObject(object.get(key));
                } catch (Exception ignored) {
                }
            } else if (ObjectUtil.isPlainObject(o.getObject())) {
                try {
                    Method[] methods = o.getObject().getClass().getMethods();
                    for (Method method : methods) {
                        if (method.getName().equals("get" + key.substring(0, 1).toUpperCase() + key.substring(1))) {
                            MethodInvoker methodInvoker = new StrictMethodInvoker();
                            return methodInvoker.invoke(o.getObject(), method.getName(), new SingleLevelContext());
                        }
                    }
                } catch (Exception ignored) {
                }
            }
        }
        return null;
    }

    private TypedObject getFromContextWithExpression(String key, PropertyExpression propertyExpression) {
        String valueKey = PropertyUtil.removeUnpackKeyword(propertyExpression.getValue(String.class));

        TypedObject o = context.get(valueKey);
        if (o == null)
            throw new NoSuchElementException(
                    String.format("[%s] is not in the context.", key));

        o = PropertyUtil.access(o, propertyExpression.getAccessors());
        return o;
    }

    private TypeDescribableObject getFromContext(String key) {
        TypeDescribableObject o = context.get(key) == null ? null
                : context.get(key).toTypeDescribableObject();

        if (o == null)
            throw new NoSuchElementException("No key[" + key + "] exists.");

        return o;
    }

    @Override
    public TypeDescribableObject getOneValueByType(Type type) {
        List<TypedObject> typedObject = context.get(type);
        if (typedObject.size() == 0)
            throw new NoSuchElementException();
        else if (typedObject.size() == 1)
            return typedObject.get(0).toTypeDescribableObject();
        else
            throw new NoUniqueElementException(
                    String.format("There are more than 2 values matching [%s].", type.toString()));
    }

    @Override
    public boolean hasKey(String key) {
        if (inputs.containsKey(key))
            return true;

        // inputProperty 에 정의된 것만 찾아서 반환
        if (inputOnly && inputProperty.size() > 0) {
            PropertyExpression propertyExpression = PropertyUtil.findOneByAlias(inputProperty, key);

            if (propertyExpression == null) {
                return findKeyByUnpackedAlias(key);
            }

            return context.get(propertyExpression.getValue(String.class)) != null;
        } else if (!inputOnly && inputProperty.size() > 0) {
            PropertyExpression propertyExpression = PropertyUtil.findOneByAlias(inputProperty, key);

            if (propertyExpression == null) {
                if (findKeyByUnpackedAlias(key))
                    return true;
                return context.get(key) != null;
            } else
                return context.get(propertyExpression.getValue(String.class)) != null;
        } else {
            return context.get(key) != null;
        }
    }

    private boolean findKeyByUnpackedAlias(String key) {
        for (PropertyExpression alias : PropertyUtil.findUnpackedAlias(inputProperty)) {
            String s = PropertyUtil.removeUnpackKeyword(alias.getAlias(String.class));
            TypedObject o = getFromContextWithExpression(s, alias);
            if (o.getObject() instanceof Map) {
                try {
                    Map<?, ?> object = (Map<?, ?>) o.getObject();
                    if (object.containsKey(key))
                        return true;
                } catch (Exception ignored) {
                }
            } else if (ObjectUtil.isPlainObject(o.getObject())) {
                try {
                    Method[] methods = o.getObject().getClass().getMethods();
                    for (Method method : methods) {
                        if (method.getName().equals("get" + key.substring(0, 1).toUpperCase() + key.substring(1))) {
                            return true;
                        }
                    }
                } catch (Exception ignored) {
                }
            }
        }
        return false;
    }

    @Override
    public boolean hasType(Type type) {
        if (!ObjectUtil.isPlainType(type))
            return false;

        List<TypedObject> typedObject = context.get(type);
        return typedObject.size() != 0;
    }

    @Override
    public void add(String key, TypeDescribableObject typeDescribableObject) {
        throw new UnsupportedOperationException();
    }

    @Override
    public Set<String> optionalParameters() {
        return optionalParameters;
    }

    @Override
    public List<String> describeMethodBindingContext() {
        List<String> lines = new ArrayList<>();
        lines.add("Task inputs: " + describeTypedObjects(inputs));
        lines.add("inputOnly=" + inputOnly);

        if (!inputProperty.isEmpty()) {
            lines.add("Input property aliases: " + describeInputProperties());
        }

        if (inputOnly) {
            lines.add("Process/service context keys are hidden because inputOnly=true.");
        } else {
            ContextAccessor contextAccessor = new ContextAccessor(context);
            lines.add("Visible process/service keys: " + describeExecutableContextKeys(contextAccessor));
        }

        if (!optionalParameters.isEmpty()) {
            List<String> sortedOptionalParameters = new ArrayList<>(optionalParameters);
            Collections.sort(sortedOptionalParameters);
            lines.add("Optional parameters: " + sortedOptionalParameters);
        }

        lines.add("Plain types such as String, Number, Collection, Map, and Boolean are matched by " +
                "name rather than type in executable context.");
        return lines;
    }

    private String describeTypedObjects(Map<String, TypedObject> values) {
        if (values.isEmpty()) {
            return "[]";
        }

        List<String> descriptions = new ArrayList<>(values.size());
        values.entrySet().stream()
                .sorted(Map.Entry.comparingByKey())
                .forEach(entry -> descriptions.add(entry.getKey() + "=" + entry.getValue().getType().getTypeName()));
        return descriptions.toString();
    }

    private String describeInputProperties() {
        List<String> descriptions = new ArrayList<>(inputProperty.size());
        inputProperty.stream()
                .sorted(Comparator.comparing(expression -> expression.getAlias(String.class)))
                .forEach(expression -> descriptions.add(
                        expression.getAlias(String.class) + " <- " + expression.getValue(String.class)));
        return descriptions.toString();
    }

    private String describeExecutableContextKeys(ContextAccessor contextAccessor) {
        if (contextAccessor.isEmpty()) {
            return "[]";
        }

        List<String> descriptions = new ArrayList<>(contextAccessor.size());
        contextAccessor.keySet().stream()
                .sorted()
                .forEach(key -> {
                    TypedObject typedObject = context.get(key);
                    if (typedObject == null) {
                        descriptions.add(key + "=unknown");
                    } else {
                        descriptions.add(key + "=" + typedObject.getType().getTypeName());
                    }
                });
        return descriptions.toString();
    }
}
