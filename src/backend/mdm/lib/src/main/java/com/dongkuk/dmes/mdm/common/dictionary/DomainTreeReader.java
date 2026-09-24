package com.dongkuk.dmes.mdm.common.dictionary;

import com.dongkuk.dmes.mdm.repository.MdmDomainRepository;
import org.springframework.stereotype.Component;

/**
 * 요청 스레드에서 {@code TB_MDM_DOMAIN} 전체를 읽어 스냅샷을 만든다(TSK-04-03 design.md §2·§3.4). JPA 리포지토리 경로라
 * OASIS action 트랜잭션에 합류한다 — 저장 중 다시 읽으면 방금 flush 한 값이 보인다(불변 I6). 직접 커넥션을 열지 않는다(I11).
 * 테스트가 {@code @Primary} 로 감쌀 수 있게 빈으로 둔다.
 */
@Component
public class DomainTreeReader {

    private final MdmDomainRepository repository;

    public DomainTreeReader(MdmDomainRepository repository) {
        this.repository = repository;
    }

    public DomainTreeSnapshot load() {
        return DomainTreeSnapshot.of(repository.findAll().stream().map(DomainNode::from).toList());
    }
}
