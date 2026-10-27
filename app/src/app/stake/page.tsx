import { Gate } from "@/components/Gate";
import { StakePanel } from "@/components/StakePanel";

export const metadata = { title: "Stake | Zaave" };

export default function StakePage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold">Stake</h1>
      <Gate>
        <StakePanel />
      </Gate>
    </div>
  );
}
