import { RED_FLAG_KEYWORDS } from "./constants";
import { RedFlagType } from "../types";

export interface RedFlagResult {
  detected: boolean;
  type: RedFlagType | null;
  message: string;
}

export function detectRedFlags(text: string): RedFlagResult {
  const lower = text.toLowerCase();

  if (lower.includes("fever") || lower.includes("chills") || lower.includes("flu-like")) {
    return {
      detected: true, type: "fever",
      message: "It sounds like you may have a fever. This can sometimes signal mastitis or infection. Please contact your healthcare provider or IBCLC today — early treatment makes a significant difference.",
    };
  }
  if (lower.includes("mastitis") || lower.includes("breast infection") || lower.includes("abscess")) {
    return {
      detected: true, type: "mastitis",
      message: "Mastitis and breast infections need prompt medical attention. Please reach out to your doctor or midwife today. An IBCLC can also support you with pumping strategies while you recover.",
    };
  }
  if (lower.includes("severe pain") || lower.includes("unbearable") || lower.includes("bleeding nipple") || lower.includes("blood")) {
    return {
      detected: true, type: "pain",
      message: "Severe pain while pumping isn't normal and deserves attention. An IBCLC can check flange fit, positioning, and rule out any underlying issues — please connect with one soon.",
    };
  }
  if (
    lower.includes("not gaining") || lower.includes("weight loss") ||
    lower.includes("not feeding") || lower.includes("won't eat") || lower.includes("jaundice")
  ) {
    return {
      detected: true, type: "infant_concern",
      message: "Concerns about your baby's feeding or weight gain are important to address quickly. Please contact your baby's pediatrician today, and consider reaching out to an IBCLC as well.",
    };
  }

  const hasKeyword = RED_FLAG_KEYWORDS.some((kw) => lower.includes(kw));
  if (hasKeyword) {
    return {
      detected: true, type: "supply_concern",
      message: "Based on what you've shared, I'd encourage you to connect with an IBCLC or your healthcare provider for personalized support.",
    };
  }

  return { detected: false, type: null, message: "" };
}
