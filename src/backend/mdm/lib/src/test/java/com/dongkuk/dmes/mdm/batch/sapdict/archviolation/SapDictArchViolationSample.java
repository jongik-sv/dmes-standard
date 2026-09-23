package com.dongkuk.dmes.mdm.batch.sapdict.archviolation;

import com.dongkuk.dmes.mdm.contract.dictionary.MdmColumnDictionaryLookup;
import com.dongkuk.dmes.mdm.repository.MdmColumnSystemRepository;

/**
 * TSK-04-05 design.md §3.7-4 — 공허 통과 방지 음성 테스트 전용 고립 클래스. 배치 패키지({@code batch.sapdict..})를
 * 가장해 리포지토리(DB 쓰기 경로)와 계약 인터페이스를 직접 참조한다(불변 규칙 I1 의 위반 표본).
 *
 * <p>main 이 아니라 test 에만 둔다 — main 으로 옮기면 {@code SapDictNoWriteArchitectureTest} 의 본 규칙이 이 클래스를
 * 직접 잡는다.
 */
public class SapDictArchViolationSample {

    private MdmColumnSystemRepository repository;

    public void register(MdmColumnDictionaryLookup lookup) {
        lookup.byPhysName("COIL_THK");
        repository.flush();
    }
}
