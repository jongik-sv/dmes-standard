package com.dongkuk.dmes.cactus.common;

import com.dongkuk.dmes.cactus.web.response.ErrorDetail;

import java.util.ArrayList;
import java.util.Collections;
import java.util.List;

/**
 * cactus 가 모르는 업무 예외를 OASIS 응답 계약(코드·행 단위 상세)으로 바꾸는 확장점(2026-10-16, BE 리팩토링 2회차 F2).
 *
 * <p>응답 변환기({@code CactusResponseConverter})는 cactus {@link BusinessException} 과 {@link ResponseCodeAware} 만 알아본다.
 * cactus 에 의존할 수 없는 모듈의 업무 예외(예: mcm-core 가 따로 가진 {@code BusinessException} 사본)는 그래서
 * {@code meta.code} 가 시스템 오류 {@code S001} 로 나가고 {@code errors[]} 가 빠진다. 반대로 cactus-core(프레임워크)는 업무 모듈을
 * import 하지 않는다. 두 형을 모두 보는 호스트 모듈이 이 인터페이스를 구현한 빈을 등록하면 응답 변환기가 그 빈에 묻는다.
 *
 * <p>응답 변환기가 이 결과를 쓰는 규칙(어댑터 작성자가 알아야 할 것):
 * <ul>
 *   <li>응답 변환기는 원인 사슬을 바깥부터 걸으며 원소마다 {@link #translate(Throwable)} 를 부른다. 바깥 원소가 안쪽 원소보다
 *       앞서고, 같은 원소가 cactus {@link BusinessException} 이면 cactus 형이 앞선다.</li>
 *   <li>{@link ResponseCodeAware} 코드는 사슬 어디에 있어도 이 변환기의 코드보다 앞선다 — 안쪽 {@link ResponseCodeAware} 가 바깥
 *       변환 코드를 이긴다.</li>
 *   <li>코드 걷기는 트랜잭션 예외(커밋 실패)를 만나면 멈춘다 — 그 안쪽 변환 코드는 쓰지 않고 {@code S001} 이다. 상세 걷기는
 *       트랜잭션 예외에서 멈추지 않는다 — 커밋 실패여도 안쪽 변환 상세는 {@code errors[]} 로 실린다.</li>
 *   <li>{@link #translate(Throwable)} 는 cactus {@link BusinessException}({@link ErrorCode} 가 null 이거나 상세가 빈 경우)과 트랜잭션
 *       예외 래퍼에도 불린다. 그래서 이 변환기가 소유하지 않은 예외에는 반드시 null 을 돌려준다.</li>
 *   <li>코드와 상세를 따로 걸으므로 한 원소에 두 번 이상 불릴 수 있다 — 구현은 부작용 없이 같은 입력에 같은 결과를 내야 한다.</li>
 *   <li>구현이 던진 {@link RuntimeException} 만 응답 변환기가 삼킨다(경고 로그를 남기고 결과 없음으로 본다). {@link Error} 는
 *       그대로 전파된다.</li>
 * </ul>
 */
@FunctionalInterface
public interface BusinessErrorTranslator {

    /**
     * 예외 하나를 응답 계약으로 바꾼다. 원인은 보지 않는다 — 사슬은 응답 변환기가 걷는다.
     *
     * @param t 원인 사슬의 원소 하나(null 아님)
     * @return 이 변환기가 소유한 업무 예외면 그 코드·상세, 아니면 null
     */
    Translated translate(Throwable t);

    /**
     * 변환 결과. {@code errors} 는 만들 때 수정할 수 없는 사본으로 바꾼다(null 원소는 그대로 둔다).
     *
     * @param code   {@code meta.code} 로 실을 코드. null·빈 값이면 이 원소에서 코드를 정하지 않는다
     * @param errors {@code errors[]} 로 실을 행 단위 상세. null·빈 목록이면 이 원소에서 상세를 정하지 않는다
     */
    record Translated(String code, List<ErrorDetail> errors) {

        /** {@code errors} 를 수정할 수 없는 사본으로 바꾼다. null 목록은 null 그대로다. */
        public Translated {
            errors = errors == null ? null : Collections.unmodifiableList(new ArrayList<>(errors));
        }
    }
}
