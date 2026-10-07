import { pathToFileURL } from "node:url";

const requiredVariables = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
];

export function validateProductionEnvironment(environment) {
  const errors = [];

  for (const name of requiredVariables) {
    if (!environment[name]?.trim()) errors.push(`${name} is required`);
  }

  const rawUrl = environment.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (rawUrl) {
    try {
      const url = new URL(rawUrl);
      if (url.protocol !== "https:") errors.push("NEXT_PUBLIC_SUPABASE_URL must use HTTPS");
      if (["localhost", "127.0.0.1", "::1"].includes(url.hostname)) {
        errors.push("NEXT_PUBLIC_SUPABASE_URL must point to the hosted production project");
      }
      if (url.username || url.password) errors.push("NEXT_PUBLIC_SUPABASE_URL must not contain credentials");
    } catch {
      errors.push("NEXT_PUBLIC_SUPABASE_URL must be a valid absolute URL");
    }
  }

  const anonKey = environment.NEXT_PUBLIC_SUPABASE_ANON_KEY?.trim();
  if (anonKey) {
    if (anonKey.startsWith("sb_secret_")) {
      errors.push("NEXT_PUBLIC_SUPABASE_ANON_KEY contains a secret key");
    }

    const role = jwtRole(anonKey);
    if (role && role !== "anon") {
      errors.push(`NEXT_PUBLIC_SUPABASE_ANON_KEY has the unsafe JWT role ${role}`);
    }
  }

  const serviceRoleKey = environment.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (serviceRoleKey && serviceRoleKey === anonKey) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY must not match the public anonymous key");
  }
  if (serviceRoleKey?.startsWith("sb_publishable_")) {
    errors.push("SUPABASE_SERVICE_ROLE_KEY contains a public publishable key");
  }
  const serviceRole = serviceRoleKey ? jwtRole(serviceRoleKey) : null;
  if (serviceRole && serviceRole !== "service_role") {
    errors.push(`SUPABASE_SERVICE_ROLE_KEY has the unsafe JWT role ${serviceRole}`);
  }

  return errors;
}

function jwtRole(value) {
  const parts = value.split(".");
  if (parts.length !== 3) return null;

  try {
    const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8"));
    return typeof payload.role === "string" ? payload.role : null;
  } catch {
    return null;
  }
}

function run() {
  const errors = validateProductionEnvironment(process.env);
  if (errors.length > 0) {
    console.error("Production environment validation failed:");
    for (const error of errors) console.error(`- ${error}`);
    process.exitCode = 1;
    return;
  }

  console.log("Production environment validation passed.");
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  run();
}
