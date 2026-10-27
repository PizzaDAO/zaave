import { Gate } from "@/components/Gate";
import { RedeemPanel } from "@/components/RedeemPanel";

export const metadata = { title: "Redeem | Zaave" };

export default function RedeemPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold">Redeem</h1>
      <Gate>
        <RedeemPanel />
      </Gate>
    </div>
  );
}
