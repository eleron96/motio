/**
 * How the mailer talks TLS to the SMTP server, by port. Pure, so it is
 * unit-tested from vitest (src/test/shared/smtpTransport.test.ts).
 *
 * 465 is implicit TLS (the connection is encrypted from the first byte) — the
 * motio.nikog.net setup. Every other port (587, 25, 2525…) connects in plain
 * text and upgrades with STARTTLS, which is what most providers expect on 587
 * and what self-hosted installs default to.
 */
export const usesImplicitTls = (port: number): boolean => port === 465;
