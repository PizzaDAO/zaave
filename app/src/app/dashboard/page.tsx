import { DashboardPanel } from "@/components/DashboardPanel";
import { Gate } from "@/components/Gate";

export const metadata = { title: "Dashboard | Zaave" };

export default function DashboardPage() {
  return (
    <div className="space-y-4">
      <h1 className="text-3xl font-extrabold">Your pizza meter</h1>
      <Gate>
        <DashboardPanel />
      </Gate>
    </div>
  );
}
