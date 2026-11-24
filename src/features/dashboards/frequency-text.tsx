import type { Frequency } from "@/types";
import { FREQUENCY_LABELS } from "@/lib/constants";

export function FrequencyText({ frequency }: { frequency: Frequency }) {
  return <>{FREQUENCY_LABELS[frequency]}</>;
}
