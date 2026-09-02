package com.dongkuk.oasis.service;

import com.dongkuk.oasis.TypedObject;
import com.dongkuk.oasis.serialization.TypedObjectJsonSerializer;
import com.google.gson.Gson;
import com.google.gson.GsonBuilder;

import java.util.Collections;
import java.util.Map;

/**
 * 서비스 수행 결과를 직렬화 하기 쉽도록 단순화환 클래스이다.
 *
 * @author Jeongjin Kim
 * @since 2021-06-04
 */
public class PlainServiceResult {
    private final String serviceResultCode;
    private final String serviceResultMessage;
    private final String exceptionMessage;
    private final Map<String, TypedObject> results;

    /**
     * @param serviceResult 서비스 수행 결과
     */
    public PlainServiceResult(ServiceResult serviceResult) {
        this(serviceResult.serviceResultCode() == null ?
                        null : serviceResult.serviceResultCode().toString(),
                serviceResult.serviceResultMessage(),
                serviceResult.exception() == null ?
                        null : serviceResult.exception().getMessage(),
                serviceResult.results());
    }

    /**
     * @param serviceResultCode 결과 코드
     * @param results           결과 데이터
     */
    public PlainServiceResult(String serviceResultCode, Map<String, TypedObject> results) {
        this(serviceResultCode, null, null, results);
    }

    /**
     * @param serviceResultCode    결과 코드
     * @param serviceResultMessage 결과 메시지
     * @param exceptionMessage     예외 메시지
     * @param results              결과 데이터
     */
    public PlainServiceResult(String serviceResultCode,
                              String serviceResultMessage,
                              String exceptionMessage,
                              Map<String, TypedObject> results) {
        this.serviceResultCode = serviceResultCode;
        this.serviceResultMessage = serviceResultMessage;
        this.exceptionMessage = exceptionMessage;
        this.results = results == null ? null : Collections.unmodifiableMap(results);
    }

    /**
     * @return 예외 메시지
     */
    public String getExceptionMessage() {
        return exceptionMessage;
    }

    /**
     * @return 서비스 결과 코드
     */
    public String getServiceResultCode() {
        return serviceResultCode;
    }

    /**
     * @return 서비스 결과 메시지
     */
    public String getServiceResultMessage() {
        return serviceResultMessage;
    }

    /**
     * @return 결과 데이터
     */
    public Map<String, TypedObject> getResults() {
        return results;
    }

    /**
     * @return Object to json
     */
    public String toJson() {
        Gson gson = new GsonBuilder()
                .disableHtmlEscaping()
                .registerTypeAdapter(TypedObject.class, new TypedObjectJsonSerializer())
                .setPrettyPrinting().create();
        return gson.toJson(this);
    }

    @Override
    public String toString() {
        return "PlainServiceResult{" +
                "serviceResultCode='" + serviceResultCode + '\'' +
                ", serviceResultMessage='" + serviceResultMessage + '\'' +
                ", exceptionMessage='" + exceptionMessage + '\'' +
                ", results=" + results +
                '}';
    }
}
