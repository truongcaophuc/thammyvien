import type { RefObject } from "react";

type PickerInput = HTMLInputElement & {
  showPicker?: () => void;
};

export function openNativePicker(ref: RefObject<HTMLInputElement | null>) {
  const el = ref.current as PickerInput | null;
  if (!el) return;
  try {
    if (typeof el.showPicker === "function") el.showPicker();
    else el.focus();
  } catch {
    el.focus();
  }
}
