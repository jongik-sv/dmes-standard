"use client";

import { useState, useCallback } from "react";
import { validate, type ValidationRule } from "../utils/libValidation";

export interface FormErrors {
  [key: string]: string;
}

export type FieldRulesMap = Record<string, ValidationRule[]>;

export function useFormValidation() {
  const [errors, setErrors] = useState<FormErrors>({});

  const validateField = useCallback((key: string, value: unknown, rules: ValidationRule[]): boolean => {
    const result = validate(value, rules);
    setErrors((prev) => {
      if (result.valid) {
        const next = { ...prev };
        delete next[key];
        return next;
      }
      return { ...prev, [key]: result.errors[0] };
    });
    return result.valid;
  }, []);

  const validateAll = useCallback((data: Record<string, unknown>, fieldRulesMap: FieldRulesMap): boolean => {
    const newErrors: FormErrors = {};
    let allValid = true;

    for (const [key, rules] of Object.entries(fieldRulesMap)) {
      const result = validate(data[key], rules);
      if (!result.valid) {
        newErrors[key] = result.errors[0];
        allValid = false;
      }
    }

    setErrors(newErrors);
    return allValid;
  }, []);

  const clearErrors = useCallback(() => {
    setErrors({});
  }, []);

  const clearFieldError = useCallback((key: string) => {
    setErrors((prev) => {
      const next = { ...prev };
      delete next[key];
      return next;
    });
  }, []);

  return { errors, validateField, validateAll, clearErrors, clearFieldError };
}
