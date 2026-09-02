package learning.embeddedDatabase;

import com.dongkuk.oasis.utils.MapBuilder;
import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.namedparam.NamedParameterJdbcTemplate;
import org.springframework.jdbc.datasource.SingleConnectionDataSource;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabase;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseBuilder;
import org.springframework.jdbc.datasource.embedded.EmbeddedDatabaseType;

import javax.sql.DataSource;
import java.sql.SQLException;
import java.util.List;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-06-09
 */
@SuppressWarnings("SqlResolve")
public class NameSqlBindingTest {
    EmbeddedDatabase database;
    DataSource dataSource1;

    @BeforeEach
    void setup() throws SQLException {
        database = database();
        dataSource1 = new SingleConnectionDataSource(database.getConnection(), true);
    }

    private EmbeddedDatabase database() {
        EmbeddedDatabase dataSource;
        dataSource = new EmbeddedDatabaseBuilder()
                .generateUniqueName(true)
                .setType(EmbeddedDatabaseType.H2)
                .setScriptEncoding("UTF-8")
                .ignoreFailedDrops(true)
                .addScript("learning/initData.sql")
                .build();
        return dataSource;
    }

    @Test
    void namedQueryBinding() {
        Map<String, Object> param = new MapBuilder<String, Object>()
                .addEntity("firstName", "jj")
                .build();
        NamedParameterJdbcTemplate jdbcTemplate1 = new NamedParameterJdbcTemplate(dataSource1);

        List<Map<String, Object>> maps =
                jdbcTemplate1.queryForList("select id from employee where firstName = :firstName", param);

        Assertions.assertThat(maps).hasSize(1);
    }

}
