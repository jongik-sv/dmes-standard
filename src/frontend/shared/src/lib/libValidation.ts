/**
 * @file libValidation.ts
 * @description 유효성 검사 관련 유틸리티 함수 라이브러리
 *              - Nexacro libUtil.xjs의 검증 함수들을 React용으로 변환
 *
 * @functions
 * ● gfn_isRsrNo          : 주민등록번호 유효성 검사
 * ● gfn_isCompRegNo      : 사업자등록번호 유효성 검사
 * ● gfn_isCorpRegNo      : 법인등록번호 유효성 검사
 * ● gfn_isEmail          : 이메일 주소 유효성 검사
 * ● gfn_isCellPhone      : 휴대폰번호 유효성 검사
 * ● gfn_isPhone          : 전화번호 유효성 검사
 * ● gfn_checkSpecialChar : 특수문자 체크
 * ● gfn_isUrl            : URL 유효성 검사
 * ● gfn_isIPAddress      : IP 주소 유효성 검사
 * ● gfn_isRequired       : 필수값 체크
 * ● gfn_isMinLength      : 최소 길이 체크
 * ● gfn_isMaxLength      : 최대 길이 체크
 * ● gfn_isRange          : 숫자 범위 체크
 * ● gfn_isCardNo         : 카드번호 유효성 검사
 * ● gfn_isAccountNo      : 계좌번호 형식 체크
 */

import { gfn_isNull } from './libUtil';
import { gfn_isMaxLength } from './libString';

// ============================================================
// 1. 내부 유틸리티 함수
// ============================================================

/**
 * @function isNumeric
 * @description 숫자 문자열 체크 (내부용)
 */
function isNumeric(sValue: unknown): boolean {
  if (gfn_isNull(sValue)) return false;
  return /^[0-9]+$/.test(String(sValue));
}

// ============================================================
// 2. 신분/사업자 번호 검증
// ============================================================

/**
 * @function gfn_isRsrNo
 * @description 주민등록번호 유효성 검사
 *
 * @param rsrno - 주민등록번호 (하이픈 포함 또는 미포함)
 * @returns 유효하면 true
 *
 * @example
 * gfn_isRsrNo("8001011234567")  // true 또는 false
 * gfn_isRsrNo("800101-1234567") // true 또는 false
 */
export function gfn_isRsrNo(rsrno: string | null | undefined): boolean {
  if (gfn_isNull(rsrno)) return false;

  // 하이픈 제거 및 공백 제거
  const juminNo = String(rsrno).replace(/-/g, "").trim();

  // 13자리 숫자인지 확인
  if (!isNumeric(juminNo) || juminNo.length !== 13) {
    return false;
  }

  // 검증 계수
  const checkDigits = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  const fNum = juminNo.substring(0, 6);
  const lNum = juminNo.substring(6);
  const lnumFirst = lNum.substring(0, 1);

  // 성별/세기 코드 검증
  let yy: string;
  if (['1', '2', '5', '6'].includes(lnumFirst)) {
    yy = '19';
  } else if (['3', '4', '7', '8'].includes(lnumFirst)) {
    yy = '20';
  } else if (['9', '0'].includes(lnumFirst)) {
    yy = '18';
  } else {
    return false;
  }

  // 날짜 유효성 검사
  const fullYear = yy + fNum;
  const year = parseInt(fullYear.substring(0, 4), 10);
  const month = parseInt(fullYear.substring(4, 6), 10);
  const day = parseInt(fullYear.substring(6, 8), 10);

  const dateObj = new Date(year, month - 1, day);
  if (dateObj.getFullYear() !== year ||
    dateObj.getMonth() !== month - 1 ||
    dateObj.getDate() !== day) {
    return false;
  }

  // 외국인 여부
  const isForeigner = ['5', '6', '7', '8'].includes(lnumFirst);

  // 체크섬 계산
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(juminNo.substring(i, i + 1), 10) * checkDigits[i];
  }

  let checksum = 11 - (sum % 11);
  checksum = checksum % 10;

  if (isForeigner) {
    checksum += 2;
    if (checksum >= 10) checksum -= 10;
  }

  return checksum === parseInt(juminNo.substring(12, 13), 10);
}

/**
 * @function gfn_isCompRegNo
 * @description 사업자등록번호 유효성 검사
 *
 * @param compNo - 사업자등록번호 (하이픈 포함 또는 미포함)
 * @returns 유효하면 true
 *
 * @example
 * gfn_isCompRegNo("1234567890")     // true 또는 false
 * gfn_isCompRegNo("123-45-67890")   // true 또는 false
 */
export function gfn_isCompRegNo(compNo: string | null | undefined): boolean {
  if (gfn_isNull(compNo)) return false;

  // 하이픈 제거
  const bizNo = String(compNo).replace(/-/g, "").trim();

  // 10자리 숫자인지 확인
  if (!isNumeric(bizNo) || bizNo.length !== 10) {
    return false;
  }

  // 검증 계수
  const checkDigits = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;

  for (let i = 0; i < 9; i++) {
    sum += parseInt(bizNo.charAt(i), 10) * checkDigits[i];
  }

  // 9번째 자리 특별 처리
  sum += Math.floor((parseInt(bizNo.charAt(8), 10) * 5) / 10);

  const remainder = sum % 10;
  const checkDigit = (10 - remainder) % 10;

  return checkDigit === parseInt(bizNo.charAt(9), 10);
}

/**
 * @function gfn_isCorpRegNo
 * @description 법인등록번호 유효성 검사
 *
 * @param corpNo - 법인등록번호 (하이픈 포함 또는 미포함)
 * @returns 유효하면 true
 *
 * @example
 * gfn_isCorpRegNo("1101111234567")   // true 또는 false
 * gfn_isCorpRegNo("110111-1234567")  // true 또는 false
 */
export function gfn_isCorpRegNo(corpNo: string | null | undefined): boolean {
  if (gfn_isNull(corpNo)) return false;

  // 하이픈 제거
  const corpRegNo = String(corpNo).replace(/-/g, "").trim();

  // 13자리 숫자인지 확인
  if (!isNumeric(corpRegNo) || corpRegNo.length !== 13) {
    return false;
  }

  // 검증 계수
  const checkDigits = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;

  for (let i = 0; i < 12; i++) {
    sum += parseInt(corpRegNo.charAt(i), 10) * checkDigits[i];
  }

  const remainder = sum % 10;
  const checkDigit = (10 - remainder) % 10;

  return checkDigit === parseInt(corpRegNo.charAt(12), 10);
}

// ============================================================
// 3. 연락처 검증
// ============================================================

/**
 * @function gfn_isEmail
 * @description 이메일 주소 유효성 검사
 *
 * @param email - 이메일 주소
 * @returns 유효하면 true
 *
 * @example
 * gfn_isEmail("test@example.com")  // true
 * gfn_isEmail("invalid-email")     // false
 */
export function gfn_isEmail(email: string | null | undefined): boolean {
  if (gfn_isNull(email)) return false;

  // RFC 5322 기반 이메일 정규식
  const emailRegex = /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;

  return emailRegex.test(String(email).trim());
}

// 별칭 (Nexacro 호환)
export const gfn_isEmailo = gfn_isEmail;

/**
 * @function gfn_isCellPhone
 * @description 휴대폰번호 유효성 검사
 *
 * @param phone - 휴대폰번호
 * @returns 유효하면 true
 *
 * @example
 * gfn_isCellPhone("01012345678")   // true
 * gfn_isCellPhone("010-1234-5678") // true
 * gfn_isCellPhone("0112345678")    // false
 */
export function gfn_isCellPhone(phone: string | null | undefined): boolean {
  if (gfn_isNull(phone)) return false;

  // 숫자만 추출
  const phoneNum = String(phone).replace(/[^0-9]/g, "");

  // 휴대폰 정규식 (010, 011, 016, 017, 018, 019)
  const cellPhoneRegex = /^01[016789][0-9]{7,8}$/;

  return cellPhoneRegex.test(phoneNum);
}

/**
 * @function gfn_isPhone
 * @description 전화번호 유효성 검사 (일반전화 + 휴대폰)
 *
 * @param phone - 전화번호
 * @returns 유효하면 true
 *
 * @example
 * gfn_isPhone("0212345678")    // true
 * gfn_isPhone("02-1234-5678")  // true
 * gfn_isPhone("01012345678")   // true
 */
export function gfn_isPhone(phone: string | null | undefined): boolean {
  if (gfn_isNull(phone)) return false;

  // 숫자만 추출
  const phoneNum = String(phone).replace(/[^0-9]/g, "");

  // 전화번호 정규식 (휴대폰 + 일반전화)
  const phoneRegex = /^(01[016789][0-9]{7,8}|0[2-6][0-9]{7,8}|0[78]0[0-9]{7,8}|050[0-9]{8,9})$/;

  return phoneRegex.test(phoneNum);
}

// ============================================================
// 4. 문자열 패턴 검증
// ============================================================

/**
 * @function gfn_checkSpecialChar
 * @description 특수문자 포함 여부 체크
 *
 * @param str - 체크할 문자열
 * @param allowedChars - 허용할 특수문자 (옵션)
 * @returns 특수문자가 있으면 true
 *
 * @example
 * gfn_checkSpecialChar("hello@world")  // true
 * gfn_checkSpecialChar("hello")        // false
 */
export function gfn_checkSpecialChar(str: string | null | undefined, allowedChars: string = ""): boolean {
  if (gfn_isNull(str)) return false;

  // 기본 특수문자 패턴 (영문, 숫자, 한글, 공백 제외)
  let pattern: RegExp = /[^a-zA-Z0-9가-힣\s]/;

  if (allowedChars) {
    // 허용 문자 이스케이프 처리
    const escaped = allowedChars.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    pattern = new RegExp(`[^a-zA-Z0-9가-힣\\s${escaped}]`);
  }

  return pattern.test(String(str));
}

/**
 * @function gfn_isUrl
 * @description URL 유효성 검사
 *
 * @param url - URL 문자열
 * @returns 유효하면 true
 *
 * @example
 * gfn_isUrl("https://www.example.com")  // true
 * gfn_isUrl("not-a-url")                // false
 */
export function gfn_isUrl(url: string | null | undefined): boolean {
  if (gfn_isNull(url)) return false;

  const urlRegex = /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/i;

  return urlRegex.test(String(url).trim());
}

/**
 * @function gfn_isIPAddress
 * @description IP 주소 유효성 검사 (IPv4)
 *
 * @param ip - IP 주소
 * @returns 유효하면 true
 *
 * @example
 * gfn_isIPAddress("192.168.0.1")  // true
 * gfn_isIPAddress("256.0.0.1")    // false
 */
export function gfn_isIPAddress(ip: string | null | undefined): boolean {
  if (gfn_isNull(ip)) return false;

  const ipRegex = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;

  return ipRegex.test(String(ip).trim());
}

// ============================================================
// 5. 기본 검증 함수
// ============================================================

/**
 * @function gfn_isRequired
 * @description 필수값 체크
 *
 * @param value - 체크할 값
 * @returns 값이 있으면 true
 *
 * @example
 * gfn_isRequired("hello")  // true
 * gfn_isRequired("")       // false
 * gfn_isRequired(null)     // false
 */
export function gfn_isRequired(value: unknown): boolean {
  return !gfn_isNull(value);
}

/**
 * @function gfn_isMinLength
 * @description 최소 길이 체크
 *
 * @param value - 체크할 문자열
 * @param minLen - 최소 길이
 * @returns 최소 길이 이상이면 true
 *
 * @example
 * gfn_isMinLength("hello", 3)  // true
 * gfn_isMinLength("hi", 3)     // false
 */
export function gfn_isMinLength(value: string | null | undefined, minLen: number): boolean {
  if (gfn_isNull(value)) return minLen <= 0;
  return String(value).length >= minLen;
}

/**
 * @function gfn_isMaxLength
 * @description 최대 길이 체크
 *
 * @param value - 체크할 문자열
 * @param maxLen - 최대 길이
 * @returns 최대 길이 이하면 true
 *
 * @example
 * gfn_isMaxLength("hello", 10)  // true
 * gfn_isMaxLength("hello world", 5)  // false
 */
// gfn_isMaxLength는 libString.ts에서 제공 (중복 방지)

/**
 * @function gfn_isLengthRange
 * @description 길이 범위 체크
 *
 * @param value - 체크할 문자열
 * @param minLen - 최소 길이
 * @param maxLen - 최대 길이
 * @returns 범위 내이면 true
 */
export function gfn_isLengthRange(value: string | null | undefined, minLen: number, maxLen: number): boolean {
  return gfn_isMinLength(value, minLen) && gfn_isMaxLength(value, maxLen);
}

/**
 * @function gfn_isRange
 * @description 숫자 범위 체크
 *
 * @param value - 체크할 숫자
 * @param min - 최소값
 * @param max - 최대값
 * @returns 범위 내이면 true
 *
 * @example
 * gfn_isRange(5, 1, 10)   // true
 * gfn_isRange(15, 1, 10)  // false
 */
export function gfn_isRange(value: number | string, min: number, max: number): boolean {
  const num = parseFloat(String(value));
  if (isNaN(num)) return false;
  return num >= min && num <= max;
}

// ============================================================
// 6. 금융 관련 검증
// ============================================================

/**
 * @function gfn_isCardNo
 * @description 카드번호 유효성 검사 (Luhn 알고리즘)
 *
 * @param cardNo - 카드번호 (하이픈 포함 또는 미포함)
 * @returns 유효하면 true
 *
 * @example
 * gfn_isCardNo("4111111111111111")  // true (테스트 카드번호)
 */
export function gfn_isCardNo(cardNo: string | null | undefined): boolean {
  if (gfn_isNull(cardNo)) return false;

  // 숫자만 추출
  const digits = String(cardNo).replace(/[^0-9]/g, "");

  // 13-19자리 체크
  if (digits.length < 13 || digits.length > 19) {
    return false;
  }

  // Luhn 알고리즘
  let sum = 0;
  let isEven = false;

  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);

    if (isEven) {
      digit *= 2;
      if (digit > 9) {
        digit -= 9;
      }
    }

    sum += digit;
    isEven = !isEven;
  }

  return (sum % 10) === 0;
}

/**
 * @function gfn_isAccountNo
 * @description 계좌번호 형식 체크 (숫자와 하이픈만)
 *
 * @param accountNo - 계좌번호
 * @returns 유효하면 true
 *
 * @example
 * gfn_isAccountNo("123-456-789012")  // true
 */
export function gfn_isAccountNo(accountNo: string | null | undefined): boolean {
  if (gfn_isNull(accountNo)) return false;

  // 숫자만 추출
  const digits = String(accountNo).replace(/[^0-9]/g, "");

  // 10-16자리 체크 (은행별로 다름)
  return digits.length >= 10 && digits.length <= 16;
}

// ============================================================
// 7. 패스워드 검증
// ============================================================

/**
 * @interface PasswordOptions
 * @description gfn_isPassword 옵션
 */
export interface PasswordOptions {
  minLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumber?: boolean;
  requireSpecial?: boolean;
}

/**
 * @interface ValidationResult
 * @description 검증 결과 타입
 */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

/**
 * @function gfn_isPassword
 * @description 패스워드 강도 검사
 *
 * @param password - 패스워드
 * @param options - 옵션
 * @returns { valid: boolean, errors: string[] }
 *
 * @example
 * gfn_isPassword("Test123!")
 * // { valid: true, errors: [] }
 */
export function gfn_isPassword(password: string | null | undefined, options: PasswordOptions = {}): ValidationResult {
  const {
    minLength = 8,
    requireUppercase = true,
    requireLowercase = true,
    requireNumber = true,
    requireSpecial = false
  } = options;

  const errors: string[] = [];

  if (gfn_isNull(password)) {
    return { valid: false, errors: ['패스워드를 입력하세요.'] };
  }

  const pwd = String(password);

  if (pwd.length < minLength) {
    errors.push(`최소 ${minLength}자 이상이어야 합니다.`);
  }

  if (requireUppercase && !/[A-Z]/.test(pwd)) {
    errors.push('대문자를 포함해야 합니다.');
  }

  if (requireLowercase && !/[a-z]/.test(pwd)) {
    errors.push('소문자를 포함해야 합니다.');
  }

  if (requireNumber && !/[0-9]/.test(pwd)) {
    errors.push('숫자를 포함해야 합니다.');
  }

  if (requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) {
    errors.push('특수문자를 포함해야 합니다.');
  }

  return {
    valid: errors.length === 0,
    errors
  };
}

/**
 * @interface PasswordStrengthResult
 * @description 패스워드 강도 결과 타입
 */
export interface PasswordStrengthResult {
  score: number;
  level: 'weak' | 'fair' | 'good' | 'strong';
}

/**
 * @function gfn_getPasswordStrength
 * @description 패스워드 강도 점수 계산
 *
 * @param password - 패스워드
 * @returns { score: 0-100, level: 'weak'|'fair'|'good'|'strong' }
 */
export function gfn_getPasswordStrength(password: string | null | undefined): PasswordStrengthResult {
  if (gfn_isNull(password)) {
    return { score: 0, level: 'weak' };
  }

  const pwd = String(password);
  let score = 0;

  // 길이 점수
  if (pwd.length >= 8) score += 20;
  if (pwd.length >= 12) score += 10;
  if (pwd.length >= 16) score += 10;

  // 문자 종류 점수
  if (/[a-z]/.test(pwd)) score += 15;
  if (/[A-Z]/.test(pwd)) score += 15;
  if (/[0-9]/.test(pwd)) score += 15;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) score += 15;

  // 레벨 판정
  let level: 'weak' | 'fair' | 'good' | 'strong';
  if (score < 30) level = 'weak';
  else if (score < 50) level = 'fair';
  else if (score < 70) level = 'good';
  else level = 'strong';

  return { score: Math.min(score, 100), level };
}

// ============================================================
// 8. 한글 관련 검증
// ============================================================

/**
 * @function gfn_isKorean
 * @description 한글만 포함되었는지 체크
 *
 * @param str - 체크할 문자열
 * @returns 한글만 있으면 true
 *
 * @example
 * gfn_isKorean("홍길동")  // true
 * gfn_isKorean("홍길동1") // false
 */
export function gfn_isKorean(str: string | null | undefined): boolean {
  if (gfn_isNull(str)) return false;
  return /^[가-힣]+$/.test(String(str));
}

/**
 * @function gfn_isKoreanWithSpace
 * @description 한글과 공백만 포함되었는지 체크
 *
 * @param str - 체크할 문자열
 * @returns 한글과 공백만 있으면 true
 */
export function gfn_isKoreanWithSpace(str: string | null | undefined): boolean {
  if (gfn_isNull(str)) return false;
  return /^[가-힣\s]+$/.test(String(str));
}

/**
 * @function gfn_isAlphaNumeric
 * @description 영문과 숫자만 포함되었는지 체크
 *
 * @param str - 체크할 문자열
 * @returns 영문/숫자만 있으면 true
 */
export function gfn_isAlphaNumeric(str: string | null | undefined): boolean {
  if (gfn_isNull(str)) return false;
  return /^[a-zA-Z0-9]+$/.test(String(str));
}

// ============================================================
// 9. 통합 검증 함수
// ============================================================

/**
 * @interface ValidationRule
 * @description 검증 규칙 타입
 */
export interface ValidationRule {
  type: 'required' | 'email' | 'phone' | 'cellPhone' | 'minLength' | 'maxLength' | 'range' | 'pattern' | 'custom';
  message?: string;
  value?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  validator?: (value: unknown) => boolean;
}

/**
 * @function gfn_validate
 * @description 여러 규칙으로 통합 검증
 *
 * @param value - 검증할 값
 * @param rules - 검증 규칙 배열
 * @returns { valid: boolean, errors: string[] }
 *
 * @example
 * gfn_validate("test", [
 *   { type: 'required', message: '필수 입력입니다.' },
 *   { type: 'email', message: '이메일 형식이 아닙니다.' }
 * ])
 */
export function gfn_validate(value: unknown, rules: ValidationRule[]): ValidationResult {
  const errors: string[] = [];

  for (const rule of rules) {
    let isValid = true;

    switch (rule.type) {
      case 'required':
        isValid = gfn_isRequired(value);
        break;
      case 'email':
        isValid = gfn_isNull(value) || gfn_isEmail(value as string);
        break;
      case 'phone':
        isValid = gfn_isNull(value) || gfn_isPhone(value as string);
        break;
      case 'cellPhone':
        isValid = gfn_isNull(value) || gfn_isCellPhone(value as string);
        break;
      case 'minLength':
        isValid = gfn_isMinLength(value as string, rule.value!);
        break;
      case 'maxLength':
        isValid = gfn_isMaxLength(value as string, rule.value!);
        break;
      case 'range':
        isValid = gfn_isRange(value as number, rule.min!, rule.max!);
        break;
      case 'pattern':
        isValid = gfn_isNull(value) || rule.pattern!.test(String(value));
        break;
      case 'custom':
        isValid = rule.validator!(value);
        break;
    }

    if (!isValid) {
      errors.push(rule.message || `${rule.type} 검증 실패`);
    }
  }

  return {
    valid: errors.length === 0,
    errors
  };
}
