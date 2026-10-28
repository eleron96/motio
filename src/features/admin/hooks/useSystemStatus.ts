import { useCallback, useEffect, useState } from 'react';
import { invokeAdminFunction } from '@/infrastructure/auth/functionsGateway';
import type { SystemStatus, TestEmailResult } from '@/features/admin/lib/systemStatus';

/** Admin "System" section: loads the install's status and sends a test email. */
export const useSystemStatus = () => {
  const [status, setStatus] = useState<SystemStatus | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [testEmail, setTestEmail] = useState<TestEmailResult | null>(null);
  const [sending, setSending] = useState(false);

  const refresh = useCallback(async () => {
    setLoading(true);
    const result = await invokeAdminFunction<{ status: SystemStatus }>({ action: 'system.status' });
    setLoading(false);
    if (result.error !== undefined) {
      setError(result.error);
      return;
    }
    setError(null);
    setStatus(result.data.status);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const sendTestEmail = useCallback(async () => {
    setSending(true);
    const result = await invokeAdminFunction<{ result: TestEmailResult }>({ action: 'system.testEmail' });
    setSending(false);
    setTestEmail(result.error !== undefined ? { status: 'failed', message: result.error } : result.data.result);
  }, []);

  return { status, loading, error, refresh, testEmail, sending, sendTestEmail };
};
