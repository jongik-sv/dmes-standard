package learning.time;

import org.junit.jupiter.api.Test;

import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;

public class TimeTest {
    @Test
    void instantAndLocalDateTime() {
        Instant instant = Instant.now();
        System.out.println(instant);

        System.out.println(LocalDateTime.now());

        LocalDateTime localDateTime = LocalDateTime.ofInstant(instant, ZoneId.systemDefault());
        System.out.println(localDateTime);
        System.out.println(ZoneId.systemDefault());

        System.out.println(new Timestamp(System.currentTimeMillis()));

        Instant now = Instant.from(new Timestamp(System.currentTimeMillis()).toInstant());

        System.out.println(LocalDateTime.ofInstant(now, ZoneId.systemDefault()));
    }
}
