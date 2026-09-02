package sample.context;

import com.dongkuk.oasis.methodinvoker.SingleLevelContext;
import com.dongkuk.oasis.methodinvoker.TypeDescribableObject;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.NoSuchElementException;

/**
 * @author Jeongjin Kim
 * @since 2021-03-25
 */
class SingleLevelContextTest {
    @Test
    void typeCheck() {
        SingleLevelContext singleLevelContext = new SingleLevelContext();
        singleLevelContext.add("a", new TypeDescribableObject(1, Integer.class));
        TypeDescribableObject oneValueOfType = singleLevelContext.getOneValueByType(Number.class);
        Integer object = oneValueOfType.getObject(Integer.class);
        Assertions.assertThat(object).isEqualTo(1);
    }

    @Test
    void reversedTypeCheck() {
        SingleLevelContext singleLevelContext = new SingleLevelContext();
        singleLevelContext.add("a", new TypeDescribableObject(1, Number.class));
        Assertions.assertThatExceptionOfType(NoSuchElementException.class)
                .isThrownBy(() -> singleLevelContext.getOneValueByType(Integer.class));
    }
}