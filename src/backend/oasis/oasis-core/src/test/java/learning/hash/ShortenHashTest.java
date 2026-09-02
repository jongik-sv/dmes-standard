package learning.hash;

import org.junit.jupiter.api.Test;
import org.springframework.util.StopWatch;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Random;
import java.util.UUID;

/**
 * @author Jeongjin Kim
 * @since 2021-12-10
 */
public class ShortenHashTest {
    Random random = new Random();

    @Test
    void shortenString() {
        int leftLimit = 48; // numeral '0'
        int rightLimit = 122; // letter 'z'
        int targetStringLength = 4;

        String result = generateRandomString("localhost-startStop-1", 4);

        System.out.println(result);
    }

    @Test
    void maxLength() throws NoSuchAlgorithmException {
        String data = "localhost-startStop-1";
        MessageDigest instance;
        instance = MessageDigest.getInstance("SHA-256");

        byte[] digest = instance.digest(data.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder();
        for (byte b : digest)
            result.append(Integer.toString((b & 0xff) + 0x100, 16).substring(1));

        System.out.println(result.length());
    }

    private String generateRandomString(String data, int length) {
        MessageDigest instance;
        try {
            instance = MessageDigest.getInstance("SHA-256");
        } catch (NoSuchAlgorithmException e) {
            return "";
        }

        byte[] digest = instance.digest(data.getBytes(StandardCharsets.UTF_8));
        StringBuilder result = new StringBuilder();
        for (byte b : digest)
            result.append(Integer.toString((b & 0xff) + 0x100, 16).substring(1));

        return result.substring(0, length);
    }

    @Test
    public void givenUsingJava8_whenGeneratingRandomAlphanumericString_thenCorrect() {
        StopWatch stopWatch = new StopWatch();
        stopWatch.start();
        for (int i = 0; i < 100000; i++) {
            String generatedString = generateRandomString(4);
        }
        stopWatch.stop();
        System.out.println(stopWatch.getTotalTimeMillis());

    }

    @Test
    public void randomStringUsingUUID() {
        StopWatch stopWatch = new StopWatch();
        stopWatch.start();
        for (int i = 0; i < 100000; i++) {
            String generatedString = UUID.randomUUID().toString().substring(0, 4);
        }
        stopWatch.stop();
        System.out.println(stopWatch.getTotalTimeMillis());

    }

    @Test
    public void randomStringUsingHash() {
        StopWatch stopWatch = new StopWatch();
        stopWatch.start();
        for (int i = 0; i < 100000; i++) {
            String generatedString = generateRandomString("localhost-startStop-1", 4);
        }
        stopWatch.stop();
        System.out.println(stopWatch.getTotalTimeMillis());

    }

    private String generateRandomString(int length) {
        int leftLimit = 48; // numeral '0'
        int rightLimit = 122; // letter 'z'
        int targetStringLength = length;

        String generatedString = random.ints(leftLimit, rightLimit + 1)
                .filter(i -> (i <= 57 || i >= 65) && (i <= 90 || i >= 97))
                .limit(targetStringLength)
                .collect(StringBuilder::new, StringBuilder::appendCodePoint, StringBuilder::append)
                .toString();
        return generatedString;
    }
}
