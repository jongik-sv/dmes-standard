package multi;

import org.junit.jupiter.api.Test;

class ProbexTest {
    @Test
    void runsBriefly() throws Exception {
        Thread.sleep(Long.parseLong(System.getenv().getOrDefault("SEQ_TEST_SLEEP_MS", "300")));
    }
}
