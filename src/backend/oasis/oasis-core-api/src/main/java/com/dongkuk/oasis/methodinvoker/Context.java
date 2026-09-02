package com.dongkuk.oasis.methodinvoker;

import com.dongkuk.oasis.methodinvoker.exceptions.NoUniqueElementException;

import java.lang.reflect.Type;
import java.util.Collections;
import java.util.Map;
import java.util.NoSuchElementException;
import java.util.Set;

/**
 * The central interface provides objects for an application.
 * The context can be changed in running to get and run dynamically methods.
 * The context may have a hierarchy.
 * <p>
 * When a client requests an object, it looks for the requested object from the lowest layer to the higher layer.
 * If the requested object is not found in the current layer, it is looked up in the upper layer.
 * If an object is found in one hierarchy, additional objects are searched for in the same level.
 * Particularly when only one object is to be returned using a type,
 * only the first layer that is the object founded is the boundary for searching.
 *
 * @author Jeongjin Kim
 * @since 2021-02-19
 */
public interface Context {
    /**
     * Returns the value to which the specified key is mapped.
     * if this context has no mapping for the key then a {@link NoSuchElementException} exception is thrown.
     * <p>
     * If the context has a hierarchy, there may be elements with the same key for each hierarchy.
     * At this time, this method should return the value corresponding to the given key in the nearest context.
     * <p>
     * It is different from {@link Map}, which returns {@code null} if the key does not exist.
     * Since the value for the key itself can be {@code null}, if the key itself does not exist,
     * an {@link NoSuchElementException} is explicitly thrown.
     *
     * @param key the key whose associated value is to be returned. It cannot be {@code null}
     * @return the value to which the specified key is mapped
     * @throws NoSuchElementException if this context has no mapping for the key
     */
    TypeDescribableObject getValueByKey(String key);

    /**
     * Returns one value matching the specified type.
     * If there are no elements in the context that match the given type,
     * a {@link NoSuchElementException} exception is thrown.
     * <p>
     * Gets the value in the context closest to the current position in the context hierarchy.
     * If there are two or more values that match the specified type in the same layer,
     * {@link NoUniqueElementException} exception is thrown.
     *
     * @param type the type of value to be returned. It cannot be {@code null}
     * @return one value matching the specified type
     * @throws NoUniqueElementException if there are two or more values corresponding to the specified type
     * @throws NoSuchElementException   if there are no elements in the context that match the specified type
     */
    TypeDescribableObject getOneValueByType(Type type);

    /**
     * Returns {@code true} if this context has a mapping for the specified key.
     *
     * @param key key whose presence in this context is to be tested. It cannot be {@code null}
     * @return {@code true} if this context has a mapping for the specified key
     */
    boolean hasKey(String key);

    /**
     * Returns {@code true} if this context has the value matching the specified type.
     *
     * @param type type whose presence in this context is to be tested. It cannot be {@code null}
     * @return {@code true} if this context has the value matching the specified type
     */
    boolean hasType(Type type);

    /**
     * Add object into the context.
     *
     * @param key                   key of the object
     * @param typeDescribableObject object to add
     */
    void add(String key, TypeDescribableObject typeDescribableObject);

    /**
     * Return optional parameter names.
     *
     * @return optional parameter names
     */
    default Set<String> optionalParameters() {
        return Collections.EMPTY_SET;
    }
}
