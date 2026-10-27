// Stand-in for unused optional peer dependencies (see next.config.ts). Never called at runtime.
const unavailable = () => {
  throw new Error("Optional dependency not installed");
};
export const toClientEvmSigner = unavailable;
export const x402Client = unavailable;
export const registerExactEvmScheme = unavailable;
export const registerExactSvmScheme = unavailable;
export const registerUptoEvmScheme = unavailable;
export const ExactEvmScheme = unavailable;
export const ExactSvmScheme = unavailable;
export const UptoEvmScheme = unavailable;
