export type JoinValidationResult = {
  code: string;
  name: string;
  error: "invalidName" | "invalidCode" | null;
};

export function validateJoinInput(input: { code: string; name: string; demoMode: boolean; demoCode?: string }): JoinValidationResult {
  const code = input.code.trim().toUpperCase();
  const name = input.name.trim();
  if (name.length < 2 || name.length > 60) return { code, name, error: "invalidName" };
  if (!/^[A-Z0-9-]{4,32}$/.test(code) || (input.demoMode && code !== (input.demoCode ?? "HERVAS"))) return { code, name, error: "invalidCode" };
  return { code, name, error: null };
}
