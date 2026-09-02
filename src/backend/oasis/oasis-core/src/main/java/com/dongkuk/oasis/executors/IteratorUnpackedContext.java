package com.dongkuk.oasis.executors;

import com.dongkuk.oasis.TypeReference;
import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.context.*;
import com.dongkuk.oasis.event.Event;
import com.dongkuk.oasis.model.Element;
import com.dongkuk.oasis.process.ElementFindableContext;
import com.dongkuk.oasis.utils.ObjectUtil;
import com.dongkuk.oasis.utils.StringUtil;
import com.dongkuk.oasis.methodinvoker.TypeUtils;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import java.lang.reflect.Type;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 지정한 키를 Iterator 로 사용한다.
 *
 * @author Jeongjin Kim
 * @since 2021-07-16
 */
class IteratorUnpackedContext implements ElementFindableContext {
    private static final Logger log = LoggerFactory.getLogger(IteratorUnpackedContext.class);
    private static final String ALIAS_NAME_AND_TYPE_DELIMITER = ":";
    private final ExecutableContext context;
    private final Map<String, TypedObject> unpackedIterable = new HashMap<>();
    private final ProcessContext processContext;

    /**
     * @param context      ExecutableContext
     * @param iterableItem 순환 아이템
     * @param alias        별명
     */

    public IteratorUnpackedContext(ExecutableContext context,
                                   TypedObject iterableItem,
                                   String alias) {
        this.context = context;
        if (StringUtil.hasText(alias) &&
                alias.split(ALIAS_NAME_AND_TYPE_DELIMITER).length == 2) {
            String key = alias.split(ALIAS_NAME_AND_TYPE_DELIMITER)[0].trim();
            String type = alias.split(ALIAS_NAME_AND_TYPE_DELIMITER)[1].trim();
            if (iterableItem.getObject() instanceof Map) {
                log.debug("Converting the object for the specified key [{}] to [{}].", key, type);
                Class<?> aClass;
                try {
                    aClass = Class.forName(type);
                } catch (ClassNotFoundException | NoClassDefFoundError e) {
                    throw new IllegalStateException("The specified type does not exist. " + type);
                }
                Object o = ObjectUtil.convertMapToObject((Map<?, ?>) iterableItem.getObject(), aClass);
                unpackedIterable.put(key, new TypedObject(o));
            } else {
                throw new IllegalStateException(
                        String.format("The key[%s] has been specified as type[%s]," +
                                " but the elements of the repeated collection are not Map.", key, type));
            }
        } else {
            unpackedIterable.put(alias, iterableItem);
        }
        this.unpackedIterable.put(alias, iterableItem);

        this.processContext = new IteratorUnpackedProcessContext(context.processContext(), unpackedIterable);
    }

    /**
     * @param context      ExecutableContext
     * @param iterableItem 순환 아이템
     */
    @SuppressWarnings("unchecked")
    public IteratorUnpackedContext(ExecutableContext context,
                                   TypedObject iterableItem) {
        this.context = context;
        Object item = iterableItem.getObject();

        if (ObjectUtil.isPlainObject(item)) {
            log.debug("The element object obtained from the repeating execution collection is a plain object. " +
                    "Converting the object to a Map.");
            item = ObjectUtil.convertObjectToMap(iterableItem.getObject());
        }

        if (item instanceof Map) {
            log.debug("The element object obtained from the repeating execution collection is a Map. " +
                    "Unpacking Map elements into the Context.");
            for (Map.Entry<String, ?> stringEntry : ((Map<String, ?>) item).entrySet()) {
                if (stringEntry.getValue() == null) {
                    unpackedIterable.put(stringEntry.getKey(), new TypedObject(null, Object.class));
                } else if (stringEntry.getValue() instanceof TypedObject) {
                    unpackedIterable.put(stringEntry.getKey(), (TypedObject) stringEntry.getValue());
                } else if (checkStringListType(stringEntry.getValue())) {
                    unpackedIterable.put(stringEntry.getKey(), new TypedObject(stringEntry.getValue(),
                            new TypeReference<List<String>>() {
                            }.getType()));
                } else if (checkObjectListType(stringEntry.getValue())) {
                    unpackedIterable.put(stringEntry.getKey(), new TypedObject(stringEntry.getValue(),
                            new TypeReference<List<Object>>() {
                            }.getType()));
                } else {
                    unpackedIterable.put(stringEntry.getKey(), new TypedObject(stringEntry.getValue()));
                }
            }
        }
        this.processContext = new IteratorUnpackedProcessContext(context.processContext(), unpackedIterable);
    }

    private boolean checkStringListType(Object value) {
        if (value instanceof List) {
            List<?> list = (List<?>) value;
            if (list.size() > 0) {
                return list.get(0) instanceof String;
            }
        }
        return false;
    }

    private boolean checkObjectListType(Object value) {
        if (value instanceof List) {
            List<?> list = (List<?>) value;
            if (list.size() > 0) {
                return list.get(0) != null;
            }
        }
        return false;
    }

    @Override
    public TypedObject get(String key) {
        TypedObject objectFromExecutableContext = context.get(key);
        TypedObject typedObject = unpackedIterable.get(key);
        if (typedObject == null)
            return objectFromExecutableContext;
        else {
            if (objectFromExecutableContext != null)
                log.warn("The key [{}] received from the repeating execution task" +
                        " also exists in the existing context. " +
                        "Ignoring the value in the existing context and " +
                        "using the value received from the repeating execution task.", key);
            return typedObject;
        }
    }

    @Override
    public List<TypedObject> get(Type type) {
        List<TypedObject> typedObjects = new ArrayList<>();
        for (TypedObject value : unpackedIterable.values()) {
            if (TypeUtils.isAssignable(type, value.getType()))
                typedObjects.add(value);
        }
        if (typedObjects.size() > 0)
            return typedObjects;
        else
            return context.get(type);
    }

    @Override
    public ServiceContext serviceContext() {
        return context.serviceContext();
    }

    @Override
    public ProcessContext processContext() {
        return processContext;
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

    @Override
    public Element element(String elementId) {
        return ((ElementFindableContext) context).element(elementId);
    }

    public Map<String, TypedObject> getUnpackedIterable() {
        return unpackedIterable;
    }
}
