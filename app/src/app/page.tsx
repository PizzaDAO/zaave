import { Calculator } from "@/components/Calculator";

export default function Home() {
  return (
    <div className="space-y-6">
      <div className="text-center">
        <h1 className="text-4xl font-extrabold tracking-tight sm:text-5xl">
          Supply crypto. <span className="text-tomato">Eat pizza.</span>
        </h1>
      </div>
      <Calculator />
    </div>
  );
}
