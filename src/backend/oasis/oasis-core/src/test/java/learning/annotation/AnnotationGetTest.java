package learning.annotation;

import edu.umd.cs.findbugs.annotations.SuppressFBWarnings;
import org.junit.jupiter.api.Test;
import org.springframework.core.annotation.AnnotationUtils;

import java.lang.annotation.Annotation;
import java.lang.reflect.InvocationTargetException;
import java.lang.reflect.Method;
import java.util.HashSet;
import java.util.Set;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Jeongjin Kim
 * @since 2021-07-14
 */
@SuppressFBWarnings({"DMI_INVOKING_TOSTRING_ON_ARRAY", "DMI_INVOKING_TOSTRING_ON_ARRAY", "NP_NULL_PARAM_DEREF"})
public class AnnotationGetTest {
    @Test
    void find2() throws NoSuchMethodException {
        Object test2 = findAnnotationAndGetValue(Sample.class.getMethod("test3"), A.class);
        assertThat(test2).isEqualTo("ff");
    }

    @Test
    void find() throws NoSuchMethodException {
        String test2 = (String) findAnnotationAndGetValue(Sample.class.getMethod("test2"), A.class);
        assertThat(test2).isEqualTo("ff");
    }

    Object findAnnotationAndGetValue(Method method, Class<? extends Annotation> annotationType) {
        Annotation[] declaredAnnotations = method.getDeclaredAnnotations();
        Set<Class<? extends Annotation>> failedSet = new HashSet<>();

        for (Annotation declaredAnnotation : declaredAnnotations) {
            Method valueMethod;
            try {
                valueMethod = declaredAnnotation.annotationType().getMethod("value");
            } catch (NoSuchMethodException e) {
                failedSet.add(declaredAnnotation.annotationType());
                continue;
            }
            Object value;
            try {
                value = valueMethod.invoke(declaredAnnotation);
            } catch (IllegalAccessException | InvocationTargetException e) {
                failedSet.add(declaredAnnotation.annotationType());
                continue;
            }
            if (!(value instanceof String)) {
                failedSet.add(declaredAnnotation.annotationType());
                continue;
            }

            if (declaredAnnotation.annotationType() == annotationType)
                return value;
            else {
                boolean b = hasAnnotation(declaredAnnotation, annotationType, failedSet);
                if (b)
                    return value;
            }
        }
        return null;
    }

    boolean hasAnnotation(Annotation annotation, Class<?> annotationType, Set<Class<? extends Annotation>> failedSet) {
        Annotation[] declaredAnnotations = annotation.annotationType().getDeclaredAnnotations();

        for (Annotation declaredAnnotation : declaredAnnotations) {
            if (failedSet.contains(declaredAnnotation.annotationType()))
                continue;
            if (failedSet.contains(declaredAnnotation.annotationType()))
                continue;
            if (declaredAnnotation.annotationType() == annotationType)
                return true;
            failedSet.add(declaredAnnotation.annotationType());
            boolean b = hasAnnotation(declaredAnnotation, annotationType, failedSet);
            if (b)
                return true;
        }
        return false;
    }

    @Test
    void getAnnotations() throws NoSuchMethodException {
        Method test = Sample.class.getMethod("test");
        A[] annotationsByType = test.getAnnotationsByType(A.class);
        System.out.println(annotationsByType);
        A annotation = test.getAnnotation(A.class);
        System.out.println(annotation);
        A declaredAnnotation = test.getDeclaredAnnotation(A.class);
        System.out.println(declaredAnnotation);

        Annotation[] annotations = test.getAnnotations();
        System.out.println(annotations);
        A annotation1 = AnnotationUtils.findAnnotation(test, A.class);
        System.out.println(annotation1);
        if(annotation1 != null)
            System.out.println(annotation1.value());
        Object value = AnnotationUtils.getValue(annotation1);
        System.out.println(value);
        Object defaultValue = AnnotationUtils.getDefaultValue(annotation1);
        System.out.println(defaultValue);
        boolean annotationInherited = AnnotationUtils.isAnnotationInherited(B.class, A.class);
        System.out.println(annotationInherited);

    }
}
