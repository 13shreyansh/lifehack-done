import type { Metadata } from "next";
import { MerchantStudio } from "./merchant-studio";
import "./merchant.css";

export const metadata: Metadata = {
  title: "Merchant Studio",
  description: "Turn a public storefront into a sourced, reviewable agent-ready merchant draft.",
};

export default function MerchantPage() {
  return <MerchantStudio />;
}
