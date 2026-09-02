package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.*;
import com.dongkuk.oasis.event.Event;
import com.dongkuk.oasis.expression.property.PropertyExpression;
import com.dongkuk.oasis.expression.property.PropertyUtil;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.NoSuchElementException;

import static com.dongkuk.oasis.model.PropertyNames.INPUT_KEY;

/**
 * {@code PropertyExpression}을 컨텍스트에 적용하여 결과값을 반환하는 {@link ExecutableContext}이다.
 * <p>
 *
 * @author Jeongjin Kim
 * @since 2021-07-09
 */
final class PropertyExpressionAccessibleContext implements ExecutableContext {
    private final ExecutableContext context;
    private final List<PropertyExpression> inputProperty;

    /**
     * @param context       context
     * @param inputProperty inputProperty
     */
    public PropertyExpressionAccessibleContext(ExecutableContext context,
                                               List<PropertyExpression> inputProperty) {
        if (context == null)
            throw new IllegalArgumentException("ExecutableNodeContext is null");

        this.context = context;
        this.inputProperty = inputProperty == null ? new ArrayList<>(0) : inputProperty;
    }

    @Override
    public TypedObject get(String key) {
        if (key == null)
            throw new IllegalArgumentException("Key cannot be null.");
        Map<String, TypedObject> processOutputs = context.processContext().elementOutputs();

        if (inputProperty.size() > 0) {
            PropertyExpression propertyExpression = PropertyUtil.findOneByAlias(inputProperty, key);

            if (propertyExpression == null)
                throw new NoSuchElementException(String.format(
                        "The key [%s] does not exist in the property [%s]. ", key, INPUT_KEY));

            TypedObject o = processOutputs.get(propertyExpression.getValue(String.class));
            if (o == null) {
                o = context.processContext().serviceContext().get(propertyExpression.getValue(String.class));
            }
            if (o == null)
                throw new NoSuchElementException(String.format(
                        "The key [%s] is set in the property [%s], but there is no value.", INPUT_KEY, key));
            o = PropertyUtil.access(o, propertyExpression.getAccessors());

            return o;
        } else {
            return processOutputs.get(key);
        }
    }

    @Override
    public List<TypedObject> get(Type type) {
        return context.get(type);
    }

    @Override
    public ServiceContext serviceContext() {
        return context.serviceContext();
    }

    @Override
    public ProcessContext processContext() {
        return context.processContext();
    }

    @Override
    public Object getObject(ObjectSearchCondition condition) {
        return context.getObject(condition);
    }

    @Override
    public void registerObject(Object object, ObjectRegisterInfo info) {
        context.registerObject(object, info);
    }

    @Override
    public void raiseEvent(Event event) {
        context.raiseEvent(event);
    }
}
