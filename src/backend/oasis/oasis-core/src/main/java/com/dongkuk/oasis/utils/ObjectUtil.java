package com.dongkuk.oasis.utils;

import com.dongkuk.oasis.TypeReference;
import com.google.gson.*;
import com.dongkuk.oasis.methodinvoker.TypeUtils;

import java.lang.reflect.Type;
import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.Arrays;
import java.util.Collection;
import java.util.List;
import java.util.Map;

/**
 * @author Jeongjin Kim
 * @since 2021-06-18
 */
public class ObjectUtil {
    /**
     * Plain Object 여부를 반환한다.
     *
     * @param o 테스트 할 오브젝트
     * @return 여부
     */
    public static boolean isPlainObject(Object o) {
        return !(o instanceof String)
                && !(o instanceof Map)
                && !(o instanceof Collection)
                && !(o instanceof Number)
                && !(o instanceof Boolean);
    }

    /**
     * @param type type
     * @return return
     */
    public static boolean isPlainType(Type type) {
        return !(TypeUtils.isAssignable(String.class, type))
                && !(TypeUtils.isAssignable(Map.class, type))
                && !(TypeUtils.isAssignable(Collection.class, type))
                && !(TypeUtils.isAssignable(Number.class, type))
                && !(TypeUtils.isAssignable(Boolean.class, type));
    }

    /**
     * 데이터 타입 오브젝트인지 검사한다.
     *
     * @param o 테스트 할 오브젝트
     * @return 여부
     */
    public static boolean isDataType(Object o) {
        return o instanceof String ||
                o instanceof Number ||
                o instanceof Boolean;
    }

    /**
     * 오브젝트를 Map으로 변환한다.
     *
     * @param o 변환할 오브젝트
     * @return {@code Map} 반환
     */
    public static Map<String, Object> convertObjectToMap(Object o) {
        GsonBuilder gsonBuilder = new GsonBuilder();
        gsonBuilder.setObjectToNumberStrategy(ToNumberPolicy.BIG_DECIMAL);
        Gson gson = gsonBuilder.create();
        String s = gson.toJson(o);
        return gson.fromJson(s, new TypeReference<Map<String, Object>>() {
        }.getType());
    }

    /**
     * Map을 오브젝트로 반환한다.
     *
     * @param map    소스 맵
     * @param tClass 타깃 클래스
     * @param <T>    타깃 클래스
     * @return 변환된 오브젝트
     */
    public static <T> T convertMapToObject(Map<?, ?> map, Class<T> tClass) {
        final List<String> dateTimePatternSet = Arrays.asList("yyyyMMddHHmmss", "yyyy-MM-dd HH:mm:ss");
        Gson gson = new GsonBuilder()
                .registerTypeAdapter(BigDecimal.class,
                        (JsonDeserializer<BigDecimal>) (json, typeOfT, context) -> {
                            if ("".equals(json.getAsString()))
                                return null;
                            else
                                return new BigDecimal(json.getAsString());
                        })
                .registerTypeAdapter(Integer.class,
                        (JsonDeserializer<Integer>) (json, typeOfT, context) -> {
                            if ("".equals(json.getAsString()))
                                return null;
                            else
                                return Integer.valueOf(json.getAsString());
                        })
                .registerTypeAdapter(LocalDateTime.class,
                        (JsonDeserializer<LocalDateTime>) (json, typeOfT, context) -> {
                            long seconds = json.getAsJsonObject().get("seconds").getAsLong();
                            int nanos = json.getAsJsonObject().get("nanos").getAsInt();
                            Instant instant = Instant.ofEpochSecond(seconds, nanos);
                            return LocalDateTime.ofInstant(instant, ZoneId.systemDefault());
                        })
                .registerTypeAdapter(LocalDate.class,
                        (JsonDeserializer<LocalDate>) (json, typeOfT, context) -> {
                            if (json.isJsonPrimitive()) {
                                if (((JsonPrimitive) json).isString()) {
                                    return LocalDate.parse(json.getAsString(), DateTimeFormatter.ofPattern("yyyyMMdd"));
                                }
                            }
                            return null;
                        })
                .registerTypeAdapter(Instant.class,
                        (JsonDeserializer<Instant>) (json, typeOfT, context) -> {
                            if (json.isJsonPrimitive()) {
                                if (((JsonPrimitive) json).isString()) {
                                    String date = json.getAsString();
                                    LocalDateTime parse = null;
                                    for (String pattern : dateTimePatternSet) {
                                        try {
                                            parse = LocalDateTime.parse(date, DateTimeFormatter.ofPattern(pattern));
                                        } catch (DateTimeParseException ignored) {
                                        }
                                        if (parse != null)
                                            break;
                                    }
                                    if (parse == null)
                                        return null;
                                    return parse.atZone(ZoneId.systemDefault()).toInstant();
                                }
                            } else if (json.isJsonObject()) {
                                long seconds = json.getAsJsonObject().get("seconds").getAsLong();
                                int nanos = json.getAsJsonObject().get("nanos").getAsInt();
                                return Instant.ofEpochSecond(seconds, nanos);
                            }
                            return null;
                        })
                .setFieldNamingStrategy(f -> concatUnderscoredIndex(f.getName()))
                .create();
        JsonElement jsonElement = gson.toJsonTree(map);
        return gson.fromJson(jsonElement, tClass);
    }

    static String concatUnderscoredIndex(String str) {
        if (str == null)
            return null;
        if (!str.contains("_"))
            return str;
        int i = str.lastIndexOf("_");
        if (i == 0)
            return str;
        String prefix = str.substring(0, i);
        String suffix = str.substring(i + 1);
        if (suffix.length() == 0)
            return str;
        for (int j = 0; j < suffix.length(); j++) {
            if (!Character.isDigit(suffix.charAt(j))) {
                return str;
            }
        }

        return prefix + suffix;
    }

}
