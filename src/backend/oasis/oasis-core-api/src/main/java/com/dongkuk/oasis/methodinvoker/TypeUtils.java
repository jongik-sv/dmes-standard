package com.dongkuk.oasis.methodinvoker;

import org.springframework.core.ResolvableType;

import java.lang.reflect.Type;

/**
 * Miscellaneous utility methods that related to type. Mainly for internal use within the framework.
 *
 * @author Jeongjin Kim
 * @since 2021-03-05
 */
public final class TypeUtils {
    /**
     * Check if the right-hand side type may be assigned to the left-hand side type, assuming setting by reflection.
     * Considers primitive wrapper classes as assignable to the corresponding primitive types.
     *
     * @param lhsType the target type
     * @param rhsType the value type that should be assigned to the target type
     * @return if the target type is assignable from the value type
     */
    public static boolean isAssignable(Type lhsType, Type rhsType) {
        ResolvableType lType = ResolvableType.forType(lhsType);
        ResolvableType rType = ResolvableType.forType(rhsType);

        return TypeUtils.isAssignable(lType, rType);
    }

    /**
     * Check if the right-hand side type may be assigned to the left-hand side type, assuming setting by reflection.
     * Considers primitive wrapper classes as assignable to the corresponding primitive types.
     *
     * @param lhsType the target type
     * @param rhsType the value type that should be assigned to the target type
     * @return if the target type is assignable from the value type
     */
    public static boolean isAssignable(ResolvableType lhsType, Type rhsType) {
        ResolvableType rType = ResolvableType.forType(rhsType);
        return TypeUtils.isAssignable(lhsType, rType);
    }

    /**
     * Check if the right-hand side type may be assigned to the left-hand side type, assuming setting by reflection.
     * Considers primitive wrapper classes as assignable to the corresponding primitive types.
     *
     * @param lhsType the target type
     * @param rhsType the value type that should be assigned to the target type
     * @return if the target type is assignable from the value type
     */
    public static boolean isAssignable(ResolvableType lhsType, ResolvableType rhsType) {
        return lhsType.isAssignableFrom(rhsType);
    }

    /**
     * Determine whether the given object is an instance of type.
     *
     * @param type   the target type
     * @param object the object that should be assigned to the target type
     * @return if the target type is assignable from the object
     */
    public static boolean isInstance(Type type, Object object) {
        return ResolvableType.forType(type).isInstance(object);
    }
}
