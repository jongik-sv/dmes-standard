package learning.regex;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;

import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * @author Jeongjin Kim
 * @since 2022-04-20
 */
public class ExtractClassNameFromSqlTest {
    @Test
    void extractClassName() {
        String exp = "\\/\\*.*\\bresultType\\W*=\\W*([\\w.$]*)\\b";
        String testSql =
                "/*  777u7 resultType = com.dongkuk.oasis.executors.SqlScriptTaskTest$UserDto fdfdf \n" +
                "*/\n" +
                "/*df*/\n" +
                "--asdfdfasdf\n" +
                "\n" +
                "select * from users \n" +
                "--asdfasdf";

        Pattern pattern = Pattern.compile(exp, Pattern.CASE_INSENSITIVE);
        Matcher matcher = pattern.matcher(testSql);
        Assertions.assertThat(matcher.find()).isTrue();
        Assertions.assertThat(matcher.groupCount()).isEqualTo(1);
        Assertions.assertThat(matcher.group(1)).isEqualTo("com.dongkuk.oasis.executors.SqlScriptTaskTest$UserDto");
    }
}
