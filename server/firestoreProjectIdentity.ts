export const getEffectiveFirestoreProjectId = (firestore: object): string | null => {
  try {
    const projectId = Reflect.get(firestore, "projectId") as unknown;
    return typeof projectId === "string" && projectId.trim() ? projectId.trim() : null;
  } catch {
    return null;
  }
};

const endpointSettingIsDefault = (settings: Record<string, unknown>) => {
  const acceptedHost = "firestore.googleapis.com";
  for (const key of ["host", "servicePath", "apiEndpoint"]) {
    const value = settings[key];
    if (value === undefined) continue;
    if (typeof value !== "string") return false;
    const normalized = value.trim().toLowerCase();
    if (normalized !== acceptedHost && normalized !== `${acceptedHost}:443`) return false;
  }
  if (settings.port !== undefined && settings.port !== 443) return false;
  if (settings.ssl === false) return false;
  return true;
};

const emulatorProjectId = "motofix-access-projection-emulator-test";

const hasUnapprovedEndpointOverrides = (environment: Record<string, string | undefined>) => {
  const overrideKeys = [
    "FIRESTORE_HOST",
    "FIRESTORE_API_ENDPOINT",
    "HTTP_PROXY",
    "HTTPS_PROXY",
    "ALL_PROXY",
    "http_proxy",
    "https_proxy",
    "all_proxy",
    "grpc_proxy",
    "no_grpc_proxy",
    "no_proxy",
    "NODE_TLS_REJECT_UNAUTHORIZED",
    "NODE_EXTRA_CA_CERTS",
    "SSL_CERT_FILE",
    "SSL_CERT_DIR",
    "GRPC_DEFAULT_SSL_ROOTS_FILE_PATH",
  ];
  return overrideKeys.some((key) => !!environment[key]?.trim())
    || !!environment.GOOGLE_CLOUD_UNIVERSE_DOMAIN?.trim()
      && environment.GOOGLE_CLOUD_UNIVERSE_DOMAIN.trim() !== "googleapis.com";
};

export const isApprovedFirestoreEnvironment = (
  environment: Record<string, string | undefined> = process.env,
) => !environment.FIRESTORE_EMULATOR_HOST?.trim()
  && !hasUnapprovedEndpointOverrides(environment);

const isApprovedLocalEmulator = (
  firestore: object,
  environment: Record<string, string | undefined>,
  expectedProjectId: string | undefined,
) => {
  const emulatorHost = environment.FIRESTORE_EMULATOR_HOST?.trim();
  if (expectedProjectId !== emulatorProjectId
    || !emulatorHost
    || !/^(localhost|127\.0\.0\.1):\d+$/.test(emulatorHost)
    || hasUnapprovedEndpointOverrides(environment)) return false;
  try {
    const settings = Reflect.get(firestore, "_settings");
    const match = /^(localhost|127\.0\.0\.1):(\d+)$/.exec(emulatorHost);
    if (!match) return false;
    const [, host, port] = match;
    return settings !== null
      && typeof settings === "object"
      && Reflect.get(settings, "servicePath") === host
      && Reflect.get(settings, "port") === Number(port)
      && Reflect.get(settings, "ssl") === false;
  } catch {
    return false;
  }
};

export const isDedicatedLocalAccessProjectionEmulator = (
  firestore: object,
  expectedProjectId: string,
  environment: Record<string, string | undefined> = process.env,
) => expectedProjectId === emulatorProjectId
  && isApprovedLocalEmulator(firestore, environment, expectedProjectId)
  && isApprovedProjectId(firestore, expectedProjectId);

export const isApprovedFirestoreEndpoint = (
  firestore: object,
  environment: Record<string, string | undefined> = process.env,
  expectedProjectId?: string,
) => {
  if (!isApprovedFirestoreEnvironment(environment)) {
    return isApprovedLocalEmulator(firestore, environment, expectedProjectId);
  }

  let settings: unknown;
  try {
    settings = Reflect.get(firestore, "_settings");
  } catch {
    return false;
  }
  return settings !== null
    && typeof settings === "object"
    && !Array.isArray(settings)
    && endpointSettingIsDefault(settings as Record<string, unknown>);
};

export const isApprovedFirestoreProject = (
  firestore: object,
  expectedProjectId: string,
) => isApprovedFirestoreEndpoint(firestore, process.env, expectedProjectId)
  && isApprovedProjectId(firestore, expectedProjectId);

export const isApprovedProjectId = (
  firestore: object,
  expectedProjectId: string,
) => {
  const effectiveProjectId = getEffectiveFirestoreProjectId(firestore);
  return effectiveProjectId !== null && effectiveProjectId === expectedProjectId;
};
