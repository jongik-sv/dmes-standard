package learning;

import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.assertThat;

/**
 * @author Jeongjin Kim
 * @since 2021-02-01
 */
@SuppressWarnings("SpellCheckingInspection")
public class StringLearningTest {
    @Test
    void substringTest() {
        String fileName = "abc^^aldldl.bpmn";
        assertThat(fileName.lastIndexOf("^^")).isNotEqualTo(-1);

        String substring = fileName.substring(0, fileName.lastIndexOf("^^"));
        assertThat(substring).isEqualTo("abc");

        String substring1 = fileName.substring(fileName.lastIndexOf("."));
        assertThat(substring1).isEqualTo(".bpmn");
    }

    @Test
    void split() {
        String ff = "ff    faff";
        String[] s = ff.split(" +");
        assertThat(s).hasSize(2);
    }

    @Test
    void splitKeyword() {
        String ff = "ff    faff   ->    fasd";
        String[] s = ff.split(" +-> +");
        assertThat(s).hasSize(2);
    }

    @Test
    void replace() {
        String ff = "aa   [ 'f  f'  ]";
        String s = ff.replaceAll(" +", "");
        System.out.println(s);
    }

    @Test
    void splitDel() {
        String ff = "fff|ff";
        String[] s = ff.split("\\|");
        assertThat(s).hasSize(2);
    }

    @Test
    void toStringTest() {
        int a = 1;
        long b = 1L;

        double c = 1.1;

        System.out.println(((Integer) a));
        System.out.println(((Long) b));
        System.out.println(((Double) c));
    }
}
