import { Calculator } from "@/components/Calculator";

export default function Home() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Stake USDC. <span className="text-tomato">Eat pizza.</span>
        </h1>
        <p className="mx-auto mt-3 max-w-xl text-muted">
          Zaave puts your USDC into Aave and turns the interest into pizza. Your deposit stays yours and you can withdraw anytime.
        </p>
      </div>
      <Calculator />
    </div>
  );
}
