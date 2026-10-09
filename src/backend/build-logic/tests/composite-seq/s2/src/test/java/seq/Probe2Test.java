package seq;

import org.junit.jupiter.api.Test;

class Probe2Test {
    @Test
    void runsBriefly() throws Exception {
        Thread.sleep(Long.parseLong(System.getenv().getOrDefault("SEQ_TEST_SLEEP_MS", "300")));
    }
}
