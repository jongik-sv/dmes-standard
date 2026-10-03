/**
 * 유효성 검사 유틸리티 함수
 * - 원본: dmes_react/frontend/src/lib/libValidation.js
 */

import { isNullOrEmpty } from "./libUtil";

function isNumStr(sValue: unknown): boolean {
  if (isNullOrEmpty(sValue)) return false;
  return /^[0-9]+$/.test(String(sValue));
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isValidRsrNo(rsrno: string): boolean {
  if (isNullOrEmpty(rsrno)) return false;
  const juminNo = String(rsrno).replace(/-/g, "").trim();
  if (!isNumStr(juminNo) || juminNo.length !== 13) return false;
  const checkDigits = [2, 3, 4, 5, 6, 7, 8, 9, 2, 3, 4, 5];
  const fNum = juminNo.substring(0, 6);
  const lNum = juminNo.substring(6);
  const lnumFirst = lNum.substring(0, 1);
  let yy: string;
  if (["1", "2", "5", "6"].includes(lnumFirst)) yy = "19";
  else if (["3", "4", "7", "8"].includes(lnumFirst)) yy = "20";
  else if (["9", "0"].includes(lnumFirst)) yy = "18";
  else return false;
  const fullYear = yy + fNum;
  const year = parseInt(fullYear.substring(0, 4), 10);
  const month = parseInt(fullYear.substring(4, 6), 10);
  const day = parseInt(fullYear.substring(6, 8), 10);
  const dateObj = new Date(year, month - 1, day);
  if (dateObj.getFullYear() !== year || dateObj.getMonth() !== month - 1 || dateObj.getDate() !== day) return false;
  const isForeigner = ["5", "6", "7", "8"].includes(lnumFirst);
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

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isValidBizNo(compNo: string): boolean {
  if (isNullOrEmpty(compNo)) return false;
  const bizNo = String(compNo).replace(/-/g, "").trim();
  if (!isNumStr(bizNo) || bizNo.length !== 10) return false;
  const checkDigits = [1, 3, 7, 1, 3, 7, 1, 3, 5];
  let sum = 0;
  for (let i = 0; i < 9; i++) {
    sum += parseInt(bizNo.charAt(i), 10) * checkDigits[i];
  }
  sum += Math.floor((parseInt(bizNo.charAt(8), 10) * 5) / 10);
  const remainder = sum % 10;
  const checkDigit = (10 - remainder) % 10;
  return checkDigit === parseInt(bizNo.charAt(9), 10);
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isValidCorpNo(corpNo: string): boolean {
  if (isNullOrEmpty(corpNo)) return false;
  const corpRegNo = String(corpNo).replace(/-/g, "").trim();
  if (!isNumStr(corpRegNo) || corpRegNo.length !== 13) return false;
  const checkDigits = [1, 2, 1, 2, 1, 2, 1, 2, 1, 2, 1, 2];
  let sum = 0;
  for (let i = 0; i < 12; i++) {
    sum += parseInt(corpRegNo.charAt(i), 10) * checkDigits[i];
  }
  const remainder = sum % 10;
  const checkDigit = (10 - remainder) % 10;
  return checkDigit === parseInt(corpRegNo.charAt(12), 10);
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isValidEmail(email: string): boolean {
  if (isNullOrEmpty(email)) return false;
  const emailRegex =
    /^[a-zA-Z0-9.!#$%&'*+/=?^_`{|}~-]+@[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?(?:\.[a-zA-Z0-9](?:[a-zA-Z0-9-]{0,61}[a-zA-Z0-9])?)*$/;
  return emailRegex.test(String(email).trim());
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isValidCellPhone(phone: string): boolean {
  if (isNullOrEmpty(phone)) return false;
  const phoneNum = String(phone).replace(/[^0-9]/g, "");
  return /^01[016789][0-9]{7,8}$/.test(phoneNum);
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isValidPhone(phone: string): boolean {
  if (isNullOrEmpty(phone)) return false;
  const phoneNum = String(phone).replace(/[^0-9]/g, "");
  return /^(01[016789][0-9]{7,8}|0[2-6][0-9]{7,8}|0[78]0[0-9]{7,8}|050[0-9]{8,9})$/.test(phoneNum);
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function checkSpecialChar(str: string, allowedChars: string = ""): boolean {
  if (isNullOrEmpty(str)) return false;
  let pattern = /[^a-zA-Z0-9가-힣\s]/;
  if (allowedChars) {
    const escaped = allowedChars.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    pattern = new RegExp(`[^a-zA-Z0-9가-힣\\s${escaped}]`);
  }
  return pattern.test(String(str));
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isValidUrl(url: string): boolean {
  if (isNullOrEmpty(url)) return false;
  return /^(https?:\/\/)?([\da-z.-]+)\.([a-z.]{2,6})([/\w .-]*)*\/?$/i.test(String(url).trim());
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isValidIPAddress(ip: string): boolean {
  if (isNullOrEmpty(ip)) return false;
  return /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/.test(
    String(ip).trim(),
  );
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isRequired(value: unknown): boolean {
  return !isNullOrEmpty(value);
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isMinLength(value: unknown, minLen: number): boolean {
  if (isNullOrEmpty(value)) return minLen <= 0;
  return String(value).length >= minLen;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isMaxLength(value: unknown, maxLen: number): boolean {
  if (isNullOrEmpty(value)) return true;
  return String(value).length <= maxLen;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isLengthRange(value: unknown, minLen: number, maxLen: number): boolean {
  return isMinLength(value, minLen) && isMaxLength(value, maxLen);
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isRange(value: unknown, min: number, max: number): boolean {
  const num = parseFloat(String(value));
  if (isNaN(num)) return false;
  return num >= min && num <= max;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isValidCardNo(cardNo: string): boolean {
  if (isNullOrEmpty(cardNo)) return false;
  const digits = String(cardNo).replace(/[^0-9]/g, "");
  if (digits.length < 13 || digits.length > 19) return false;
  let sum = 0;
  let isEven = false;
  for (let i = digits.length - 1; i >= 0; i--) {
    let digit = parseInt(digits.charAt(i), 10);
    if (isEven) {
      digit *= 2;
      if (digit > 9) digit -= 9;
    }
    sum += digit;
    isEven = !isEven;
  }
  return sum % 10 === 0;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isValidAccountNo(accountNo: string): boolean {
  if (isNullOrEmpty(accountNo)) return false;
  const digits = String(accountNo).replace(/[^0-9]/g, "");
  return digits.length >= 10 && digits.length <= 16;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export interface PasswordOptions {
  minLength?: number;
  requireUppercase?: boolean;
  requireLowercase?: boolean;
  requireNumber?: boolean;
  requireSpecial?: boolean;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export interface PasswordResult {
  valid: boolean;
  errors: string[];
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isValidPassword(password: string, options: PasswordOptions = {}): PasswordResult {
  const {
    minLength = 8,
    requireUppercase = true,
    requireLowercase = true,
    requireNumber = true,
    requireSpecial = false,
  } = options;
  const errors: string[] = [];
  if (isNullOrEmpty(password)) return { valid: false, errors: ["패스워드를 입력하세요."] };
  const pwd = String(password);
  if (pwd.length < minLength) errors.push(`최소 ${minLength}자 이상이어야 합니다.`);
  if (requireUppercase && !/[A-Z]/.test(pwd)) errors.push("대문자를 포함해야 합니다.");
  if (requireLowercase && !/[a-z]/.test(pwd)) errors.push("소문자를 포함해야 합니다.");
  if (requireNumber && !/[0-9]/.test(pwd)) errors.push("숫자를 포함해야 합니다.");
  if (requireSpecial && !/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) errors.push("특수문자를 포함해야 합니다.");
  return { valid: errors.length === 0, errors };
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export interface PasswordStrength {
  score: number;
  level: "weak" | "fair" | "good" | "strong";
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function getPasswordStrength(password: string): PasswordStrength {
  if (isNullOrEmpty(password)) return { score: 0, level: "weak" };
  const pwd = String(password);
  let score = 0;
  if (pwd.length >= 8) score += 20;
  if (pwd.length >= 12) score += 10;
  if (pwd.length >= 16) score += 10;
  if (/[a-z]/.test(pwd)) score += 15;
  if (/[A-Z]/.test(pwd)) score += 15;
  if (/[0-9]/.test(pwd)) score += 15;
  if (/[!@#$%^&*(),.?":{}|<>]/.test(pwd)) score += 15;
  let level: PasswordStrength["level"];
  if (score < 30) level = "weak";
  else if (score < 50) level = "fair";
  else if (score < 70) level = "good";
  else level = "strong";
  return { score: Math.min(score, 100), level };
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isKorean(str: string): boolean {
  if (isNullOrEmpty(str)) return false;
  return /^[가-힣]+$/.test(String(str));
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isKoreanWithSpace(str: string): boolean {
  if (isNullOrEmpty(str)) return false;
  return /^[가-힣\s]+$/.test(String(str));
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export function isAlphaNumeric(str: string): boolean {
  if (isNullOrEmpty(str)) return false;
  return /^[a-zA-Z0-9]+$/.test(String(str));
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export type ValidationType =
  | "required"
  | "email"
  | "phone"
  | "cellPhone"
  | "minLength"
  | "maxLength"
  | "range"
  | "pattern"
  | "custom";

export interface ValidationRule {
  type: ValidationType;
  message?: string;
  value?: number;
  min?: number;
  max?: number;
  pattern?: RegExp;
  validator?: (value: unknown) => boolean;
}

/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export interface ValidationResult {
  valid: boolean;
  errors: string[];
}

export function validate(value: unknown, rules: ValidationRule[]): ValidationResult {
  const errors: string[] = [];
  for (const rule of rules) {
    let isValid = true;
    switch (rule.type) {
      case "required":
        isValid = isRequired(value);
        break;
      case "email":
        isValid = isNullOrEmpty(value) || isValidEmail(String(value));
        break;
      case "phone":
        isValid = isNullOrEmpty(value) || isValidPhone(String(value));
        break;
      case "cellPhone":
        isValid = isNullOrEmpty(value) || isValidCellPhone(String(value));
        break;
      case "minLength":
        isValid = isMinLength(value, rule.value!);
        break;
      case "maxLength":
        isValid = isMaxLength(value, rule.value!);
        break;
      case "range":
        isValid = isRange(value, rule.min!, rule.max!);
        break;
      case "pattern":
        isValid = isNullOrEmpty(value) || rule.pattern!.test(String(value));
        break;
      case "custom":
        isValid = rule.validator!(value);
        break;
    }
    if (!isValid) errors.push(rule.message || `${rule.type} 검증 실패`);
  }
  return { valid: errors.length === 0, errors };
}

// gfn_ 호환 별칭
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isRsrNo = isValidRsrNo;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isCompRegNo = isValidBizNo;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isCorpRegNo = isValidCorpNo;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isEmail = isValidEmail;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isCellPhone = isValidCellPhone;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isPhone = isValidPhone;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_checkSpecialChar = checkSpecialChar;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isUrl = isValidUrl;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isIPAddress = isValidIPAddress;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isRequired = isRequired;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isMinLength = isMinLength;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isMaxLength = isMaxLength;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isLengthRange = isLengthRange;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isRange = isRange;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isCardNo = isValidCardNo;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isAccountNo = isValidAccountNo;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isPassword = isValidPassword;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_getPasswordStrength = getPasswordStrength;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isKorean = isKorean;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isKoreanWithSpace = isKoreanWithSpace;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_isAlphaNumeric = isAlphaNumeric;
/** @deprecated 저장소 안 사용처 없음. 다음 정리 때 archive 로 옮긴다. */
export const gfn_validate = validate;
