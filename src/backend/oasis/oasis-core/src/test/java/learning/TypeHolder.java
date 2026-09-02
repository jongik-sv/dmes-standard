package learning;

import org.junit.jupiter.api.Test;

import java.util.ArrayList;
import java.util.List;

/**
 * @author Jeongjin Kim
 * @since 2021-02-01
 */
public class TypeHolder {
    @Test
    void sample() {
        MyType m1 = new F();
        MyType m2 = new Y();
        List<MyType> list = new ArrayList<>();
        list.add(m1);
        list.add(m2);

        for (MyType myType : list) {
            if (F.class == myType.getClass())
                System.out.println("!!");

        }

    }

    interface MyType {

    }

    static class F implements MyType {

    }

    static class Y implements MyType {

    }
}
