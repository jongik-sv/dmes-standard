package com.dongkuk.oasis.utils;

import org.assertj.core.api.Assertions;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.CsvSource;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-07-14
 */
class ObjectUtilTest {
    @Test
    void checkPlainObjectType() {
        Assertions.assertThat(ObjectUtil.isPlainType(MyList.class)).isFalse();
        Assertions.assertThat(ObjectUtil.isPlainType(ArrayList.class)).isFalse();
        Assertions.assertThat(ObjectUtil.isPlainType(MyClass.class)).isTrue();
    }

    @Test
    void convertMapToObject() {
        Instant now = Instant.now();
        Map<String, Object> map =
                new MapBuilder<String, Object>()
                        .addEntity("id", 0)
                        .addEntity("firstName", "jin")
                        .addEntity("lastName", "kim")
                        .addEntity("updateTime", now)
                        .build();
        TestDto testDto = ObjectUtil.convertMapToObject(map, TestDto.class);
        Assertions.assertThat(testDto.firstName).isEqualTo("jin");
        Assertions.assertThat(testDto.lastName).isEqualTo("kim");
        Assertions.assertThat(testDto.id).isEqualTo(0);
        Assertions.assertThat(testDto.updateTime).isEqualTo(now);
    }

    @Test
    void convertMapToObjectIgnoreUnknownProperty() {
        Instant now = Instant.now();
        Map<String, Object> map =
                new MapBuilder<String, Object>()
                        .addEntity("id", 0)
                        .addEntity("firstName", "jin")
                        .addEntity("lastName", "kim")
                        .addEntity("nick", "ha")
                        .addEntity("updateTime", now)
                        .build();
        TestDto testDto = ObjectUtil.convertMapToObject(map, TestDto.class);
        Assertions.assertThat(testDto.firstName).isEqualTo("jin");
        Assertions.assertThat(testDto.lastName).isEqualTo("kim");
        Assertions.assertThat(testDto.id).isEqualTo(0);
        Assertions.assertThat(testDto.updateTime).isEqualTo(now);
    }

    @Test
    void convertMapToObjectIgnoreNotExistsMapElement() {
        Map<String, Object> map =
                new MapBuilder<String, Object>()
                        .addEntity("id", 0)
                        .addEntity("firstName", "jin")
                        .build();
        TestDto testDto = ObjectUtil.convertMapToObject(map, TestDto.class);
        Assertions.assertThat(testDto.firstName).isEqualTo("jin");
        Assertions.assertThat(testDto.lastName).isNull();
        Assertions.assertThat(testDto.id).isEqualTo(0);
        Assertions.assertThat(testDto.updateTime).isNull();
    }

    @Test
    void convertMapToObjectTryConvertInstantToLocalDateTime() {
        Instant now = Instant.now();
        LocalDateTime localDateTime = LocalDateTime.ofInstant(now, ZoneId.systemDefault());
        System.out.println(localDateTime);
        Map<String, Object> map =
                new MapBuilder<String, Object>()
                        .addEntity("id", 0)
                        .addEntity("firstName", "jin")
                        .addEntity("lastName", "kim")
                        .addEntity("nick", "ha")
                        .addEntity("updateTime", now)
                        .build();
        TestDto2 testDto = ObjectUtil.convertMapToObject(map, TestDto2.class);
        Assertions.assertThat(testDto.firstName).isEqualTo("jin");
        Assertions.assertThat(testDto.lastName).isEqualTo("kim");
        Assertions.assertThat(testDto.id).isEqualTo(0);
        Assertions.assertThat(testDto.updateTime).isEqualTo(localDateTime);
    }

    @Test
    void convertStringDateToLocalDate() {
        Map<String, Object> map =
                new MapBuilder<String, Object>()
                        .addEntity("myDate", "20200714")
                        .build();
        LocalDateDto localDateDto = ObjectUtil.convertMapToObject(map, LocalDateDto.class);
        Assertions.assertThat(localDateDto.myDate).isEqualTo(LocalDate.of(2020, 7, 14));
    }

    @Test
    void convertMapToObjectTryConvertBigDecimal() {
        Instant now = Instant.now();
        LocalDateTime localDateTime = LocalDateTime.ofInstant(now, ZoneId.systemDefault());
        System.out.println(localDateTime);
        Map<String, Object> map =
                new MapBuilder<String, Object>()
                        .addEntity("id", 0)
                        .addEntity("firstName", "jin")
                        .addEntity("lastName", "kim")
                        .addEntity("nick", "ha")
                        .addEntity("updateTime", now)
                        .addEntity("rate", 1.3)
                        .build();
        TestDto3 testDto = ObjectUtil.convertMapToObject(map, TestDto3.class);
        Assertions.assertThat(testDto.firstName).isEqualTo("jin");
        Assertions.assertThat(testDto.lastName).isEqualTo("kim");
        Assertions.assertThat(testDto.id).isEqualTo(0);
        Assertions.assertThat(testDto.updateTime).isEqualTo(localDateTime);
        Assertions.assertThat(testDto.rate).isEqualTo(new BigDecimal("1.3"));

    }

    @Test
    void convertCamelCaseMapToUnderScoredFiled() {
        Map<String, Object> map =
                new MapBuilder<String, Object>()
                        .addEntity("f01", "data")
                        .build();
        UnderScoredField underScoredField = ObjectUtil.convertMapToObject(map, UnderScoredField.class);
        Assertions.assertThat(underScoredField.getF_01()).isEqualTo("data");
    }

    @ParameterizedTest
    @CsvSource({"a,a", "a_,a_", "a_1,a1", "a_1_1,a_11", "a_1_,a_1_", "_1,_1", "a_12,a12", "a_a,a_a"})
    void underscoredIndexConcat(String input, String expected) {
        String s = ObjectUtil.concatUnderscoredIndex(input);
        Assertions.assertThat(s).isEqualTo(expected);
    }

    @Test
    void convertEmptyStringAsNullOfBigDecimal() {
        Map<String, Object> data = new MapBuilder<String, Object>()
                .addEntity("rate", "").build();
        BigDecimalDto bigDecimalDto = ObjectUtil.convertMapToObject(data, BigDecimalDto.class);
        Assertions.assertThat(bigDecimalDto.rate).isNull();
    }

    @Test
    void convertNullAsBigDecimal() {
        Map<String, Object> data = new MapBuilder<String, Object>()
                .addEntity("rate", null).build();
        BigDecimalDto bigDecimalDto = ObjectUtil.convertMapToObject(data, BigDecimalDto.class);
        Assertions.assertThat(bigDecimalDto.rate).isNull();
    }

    @Test
    void convertEmptyStringAsNullOfInteger() {
        Map<String, Object> data = new MapBuilder<String, Object>()
                .addEntity("rate", "").build();
        IntegerDto integerDto = ObjectUtil.convertMapToObject(data, IntegerDto.class);
        Assertions.assertThat(integerDto.rate).isNull();
    }

    @Test
    void convertNullAsInteger() {
        Map<String, Object> data = new MapBuilder<String, Object>()
                .addEntity("rate", null).build();
        IntegerDto integerDto = ObjectUtil.convertMapToObject(data, IntegerDto.class);
        Assertions.assertThat(integerDto.rate).isNull();
    }

    static class UnderScoredField {
        private String f_01;

        public String getF_01() {
            return f_01;
        }
    }

    static class BigDecimalDto {
        private BigDecimal rate;
    }

    static class IntegerDto {
        private Integer rate;
    }

    static class MyList extends ArrayList<String> {
        private static final long serialVersionUID = 7771195862507903350L;
    }

    static class MyClass {
    }

    static class TestDto {
        private Integer id;
        private String firstName;
        private String lastName;
        private Instant updateTime;
    }

    static class TestDto2 {
        private Integer id;
        private String firstName;
        private String lastName;
        private LocalDateTime updateTime;
    }

    static class TestDto3 {
        private Integer id;
        private String firstName;
        private String lastName;
        private LocalDateTime updateTime;
        private BigDecimal rate;
    }

    static class LocalDateDto {
        private LocalDate myDate;
    }
}