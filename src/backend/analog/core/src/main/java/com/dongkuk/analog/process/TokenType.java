package com.dongkuk.analog.process;

public enum TokenType {
    Message,        // String으로 저장 되는 메시지
    Exception,
    InfoMessage,    // 저장 되지 않고 정보만 제공, Invoking class 등 Task에 정보만 제공
    Query,          // QueryString, Query Object
    SQL,            // QueryString, MapperId가 있을 경우 MapperId에서 QueryObject를 만들고 SQL 에서 QueryString을 설정
    QueryParameter,
    Task,
    Process,
    Service,
    SubService;

    public boolean isObject() {
        return this == Service || this == Process || this == Task|| this == SubService;
    }
}
