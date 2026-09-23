package kr.dongkuk.maru.mdm.engine.spi;

/**
 * 호출자가 엔진에 넘기는 조회 구현체 묶음. 엔진 인스턴스 하나가 한 묶음을 쓴다.
 * 구현체 선택(원장·사본·저장된 버전·요청 본문)은 호출자 몫이다(06-business-rule.md:541).
 */
public record EngineLookups(
        DefinitionLookup definitions,
        CodeLookup codes,
        CodeEffLookup codeEff,
        MasterLookup masters,
        FunctionProvider functions) {}
