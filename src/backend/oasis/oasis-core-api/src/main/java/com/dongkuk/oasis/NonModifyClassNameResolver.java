package com.dongkuk.oasis;

/**
 * 클래스 이름을 별도로 변경하지 않는 {@link ClassNameResolver}.
 *
 * @author Jeongjin Kim
 * @since 2021-02-09
 */
public final class NonModifyClassNameResolver implements ClassNameResolver {
    @Override
    public String resolve(String className, Object... params) {
        return className;
    }
}
