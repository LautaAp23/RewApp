"use client";

import { useTranslations } from "next-intl";

type Props = {
  value: string;
  onChange(value: string): void;
  /** Decimals allowed by the currency (0 hides the separator key). */
  decimals: number;
  /** Decimal separator shown to the user ("," or "."). */
  separator: string;
  maxIntegerDigits?: number;
};

/** Large keypad that edits a plain "1234.5" amount string. */
export function NumericKeypad({ value, onChange, decimals, separator, maxIntegerDigits = 7 }: Props) {
  const t = useTranslations("keypad");

  const press = (key: string) => {
    if (key === "del") return onChange(value.slice(0, -1));
    if (key === ".") {
      if (decimals === 0 || value.includes(".")) return;
      return onChange(value === "" ? "0." : `${value}.`);
    }
    const [integer, fraction] = value.split(".");
    if (fraction !== undefined) {
      if (fraction.length >= decimals) return;
    } else if (integer.length >= maxIntegerDigits) {
      return;
    }
    onChange(value === "0" ? key : value + key);
  };

  const keys = ["1", "2", "3", "4", "5", "6", "7", "8", "9", ".", "0", "del"];
  return (
    <div className="grid grid-cols-3 gap-2">
      {keys.map((key) =>
        key === "." && decimals === 0 ? (
          <span key={key} />
        ) : (
          <button
            key={key}
            type="button"
            onClick={() => press(key)}
            aria-label={key === "del" ? t("delete") : key === "." ? t("decimal") : undefined}
            className="pressable min-h-16 rounded-card bg-surface text-2xl font-semibold text-text active:bg-elevated"
          >
            {key === "del" ? "⌫" : key === "." ? separator : key}
          </button>
        ),
      )}
    </div>
  );
}
