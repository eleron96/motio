const getOrigin = (value?: string | null) => {
  const normalized = (value ?? "").trim();
  if (!normalized) return null;

  try {
    return new URL(normalized).origin;
  } catch (_error) {
    return null;
  }
};

export const toPublicTaskMediaUrl = (
  signedUrl: string,
  options?: {
    publicBaseUrl?: string | null;
    requestUrl?: string | null;
  },
) => {
  let parsedSignedUrl: URL;
  try {
    parsedSignedUrl = new URL(signedUrl);
  } catch (_error) {
    return signedUrl;
  }

  const publicOrigin =
    getOrigin(options?.publicBaseUrl) ??
    getOrigin(options?.requestUrl);

  if (!publicOrigin) {
    return signedUrl;
  }

  const parsedPublicOrigin = new URL(publicOrigin);
  parsedSignedUrl.protocol = parsedPublicOrigin.protocol;
  parsedSignedUrl.hostname = parsedPublicOrigin.hostname;
  parsedSignedUrl.port = parsedPublicOrigin.port;

  return parsedSignedUrl.toString();
};
