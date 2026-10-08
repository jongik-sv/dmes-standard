package com.dongkuk.dmes.mcm.job.def;

/** 작업 변수 한 개(설계 §5.0). value 는 고정값이거나 실행 변수({@code :today} 등). */
public record JobVar(String name, Type type, String value, String desc) {

    public enum Type { STRING, NUMBER, DATE, JSON }
}
