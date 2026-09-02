package learning.embeddedDatabase;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;

/**
 * @author Jeongjin Kim
 * @since 2021-05-21
 */
@SuppressWarnings("SqlResolve")
class EmbeddedDatabaseRunTest {
    private EmbeddedDatabase dataSource;

    @BeforeEach
    void createDataSource() {
        dataSource = new EmbeddedDatabaseBuilder()
                .generateUniqueName(true)
                .setType(EmbeddedDatabaseType.H2)
                .setScriptEncoding("UTF-8")
                .ignoreFailedDrops(true)
                .addScript("transaction/EmbeddedDatabaseRunTest/schema.sql")
                .build();
    }

    @Test
    void createTableAndCountRows() {
        JdbcTemplate template = new JdbcTemplate(dataSource);
        Integer integer = template.update("insert into Employee(id, firstName, lastName ) values (0, 'hi', 'roo')");
        Assertions.assertThat(integer).isEqualTo(1);
        Integer integer2 = template.queryForObject("select count(id) from Employee", Integer.class);
        Assertions.assertThat(integer2).isEqualTo(1);
    }

    @AfterEach
    void closeDatabase() {
        dataSource.shutdown();
    }

}